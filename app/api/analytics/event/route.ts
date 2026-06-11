import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { ANALYTICS_EVENT_NAMES } from "@/lib/analytics";

const clean = (value: string | undefined) => (value || "").replace(/['";\s]+/g, "").trim();
const MAX_PAYLOAD_BYTES = 8 * 1024;
const MAX_PARAM_BYTES = 2 * 1024;
const ALLOWED_EVENT_NAMES = new Set<string>(ANALYTICS_EVENT_NAMES);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

type SanitizedParam = string | number | boolean | null;

export async function POST(request: Request) {
  const requestHost = getRequestHost(request);
  if (isLocalHost(requestHost) && process.env.ANALYTICS_ACCEPT_LOCAL !== "true") {
    return NextResponse.json({ success: true, skipped: "local_environment" });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ error: "이벤트 payload가 너무 큽니다." }, { status: 413 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "이벤트 payload가 올바르지 않습니다." }, { status: 400 });
  }

  const eventName = sanitizeText(body.name, 80);
  if (!eventName || !ALLOWED_EVENT_NAMES.has(eventName)) {
    return NextResponse.json({ error: "허용되지 않은 이벤트입니다." }, { status: 400 });
  }

  const sessionId = sanitizeText(body.sessionId, 100);
  const pagePath = sanitizePath(body.pagePath);
  if (!sessionId || !pagePath) {
    return NextResponse.json({ error: "sessionId와 pagePath가 필요합니다." }, { status: 400 });
  }

  const params = sanitizeParams(body.params);
  if (JSON.stringify(params).length > MAX_PARAM_BYTES) {
    return NextResponse.json({ error: "이벤트 params가 너무 큽니다." }, { status: 413 });
  }

  const supabaseAdmin = createSupabaseAdminClient(
    clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );

  const userProfile = await getOptionalUserProfile(supabaseAdmin, request);
  if (userProfile?.role === "admin") {
    return NextResponse.json({ success: true, skipped: "admin_activity" });
  }

  const insertPayload = {
    event_name: eventName,
    user_id: userProfile?.id || null,
    session_id: sessionId,
    page_path: pagePath,
    page_title: sanitizeText(body.pageTitle, 160),
    referrer_path: sanitizePath(body.referrerPath),
    params,
    client_environment: sanitizeText(body.clientEnvironment, 40) || getServerAnalyticsEnvironment(),
    source_host: sanitizeText(body.sourceHost, 160) || requestHost,
    is_internal: Boolean(body.isInternal) || isLocalHost(requestHost) || sanitizeText(body.clientEnvironment, 40) === "development"
  };

  const { error } = await insertAnalyticsEvent(supabaseAdmin, insertPayload);

  if (error) {
    console.warn("[analytics:event] insert failed:", error.message);
    return NextResponse.json({ error: "이벤트 저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

async function insertAnalyticsEvent(supabaseAdmin: any, insertPayload: Record<string, unknown>) {
  const result = await supabaseAdmin.from("analytics_events").insert(insertPayload);
  if (!isMissingAnalyticsOriginColumn(result.error)) return result;

  const legacyPayload = { ...insertPayload };
  delete legacyPayload.client_environment;
  delete legacyPayload.source_host;
  delete legacyPayload.is_internal;
  return supabaseAdmin.from("analytics_events").insert(legacyPayload);
}

function isMissingAnalyticsOriginColumn(error: any) {
  if (!error) return false;
  const message = `${error.message || ""} ${error.details || ""}`.toLowerCase();
  return message.includes("client_environment")
    || message.includes("source_host")
    || message.includes("is_internal");
}

async function getOptionalUserProfile(supabaseAdmin: any, request: Request) {
  const bearerToken = getBearerToken(request);
  if (bearerToken) {
    const profile = await getProfileFromAccessToken(supabaseAdmin, bearerToken);
    if (profile) return profile;
  }

  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anonKey) return null;

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Analytics collection must not mutate auth cookies.
        }
      }
    });
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    const userId = data.user?.id;
    if (!userId) return null;
    return await getProfileByUserId(supabaseAdmin, userId);
  } catch {
    return null;
  }
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function getRequestHost(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const rawHost = forwardedHost || request.headers.get("host") || new URL(request.url).host;
  return rawHost.replace(/:\d+$/, "").toLowerCase();
}

function isLocalHost(host: string | null | undefined) {
  if (!host) return false;
  const normalized = host.toLowerCase();
  return LOCAL_HOSTS.has(normalized) || normalized.endsWith(".local");
}

function getServerAnalyticsEnvironment() {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown";
}

async function getProfileFromAccessToken(supabaseAdmin: any, accessToken: string) {
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (error || !data?.user?.id) return null;
    return await getProfileByUserId(supabaseAdmin, data.user.id);
  } catch {
    return null;
  }
}

async function getProfileByUserId(supabaseAdmin: any, userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, nickname, role, pubg_nickname")
    .eq("id", userId)
    .maybeSingle();
  return profile || { id: userId, role: "user", nickname: null, pubg_nickname: null };
}

function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function sanitizePath(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 320) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return `${url.pathname}${url.search ? url.search.slice(0, 120) : ""}`.slice(0, 320);
    } catch {
      return null;
    }
  }
  return trimmed.startsWith("/") ? trimmed.slice(0, 320) : `/${trimmed}`.slice(0, 320);
}

function sanitizeParams(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, SanitizedParam> = {};

  Object.entries(value as Record<string, unknown>).slice(0, 24).forEach(([key, raw]) => {
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
    if (!safeKey) return;

    if (typeof raw === "string") {
      result[safeKey] = raw.slice(0, 220);
      return;
    }
    if (typeof raw === "number" && Number.isFinite(raw)) {
      result[safeKey] = raw;
      return;
    }
    if (typeof raw === "boolean" || raw === null) {
      result[safeKey] = raw;
    }
  });

  return result;
}
