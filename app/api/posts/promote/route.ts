import { NextResponse } from "next/server";
import { withAuthGuard } from "@/utils/supabase/guard";

const DISCORD_NOTIFICATION_TIMEOUT_MS = 1_000;

type PromoteSuccessResult = {
  result_code: "ok";
  post_id: number;
  revision: number;
  title: string;
  content: string;
  image_url: string | null;
};

type PromoteExistingPostFailureResult = {
  result_code: "revision_conflict" | "forbidden" | "already_promoted";
  post_id: number;
  revision: number;
  title: null;
  content: null;
  image_url: null;
};

type PromoteNotFoundResult = {
  result_code: "not_found";
  post_id: null;
  revision: null;
  title: null;
  content: null;
  image_url: null;
};

type PromoteResult = PromoteSuccessResult | PromoteExistingPostFailureResult | PromoteNotFoundResult;

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPromoteResult(value: unknown): value is PromoteResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (row.result_code === "ok") {
    return Number.isSafeInteger(row.post_id) && (row.post_id as number) > 0
      && isNonNegativeSafeInteger(row.revision)
      && typeof row.title === "string"
      && typeof row.content === "string"
      && (typeof row.image_url === "string" || row.image_url === null);
  }
  if (row.result_code === "revision_conflict" || row.result_code === "forbidden" || row.result_code === "already_promoted") {
    return Number.isSafeInteger(row.post_id) && (row.post_id as number) > 0
      && isNonNegativeSafeInteger(row.revision)
      && row.title === null
      && row.content === null
      && row.image_url === null;
  }
  return row.result_code === "not_found"
    && row.post_id === null
    && row.revision === null
    && row.title === null
    && row.content === null
    && row.image_url === null;
}

function parseRequestBody(value: unknown): { postId: number; expectedParentRevision: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (!keys.every((key) => key === "postId" || key === "expectedParentRevision")) return null;
  if (!Number.isSafeInteger(body.postId) || (body.postId as number) < 1
    || !Number.isSafeInteger(body.expectedParentRevision) || (body.expectedParentRevision as number) < 0) return null;
  return { postId: body.postId as number, expectedParentRevision: body.expectedParentRevision as number };
}

async function sendDiscordNotification(post: PromoteSuccessResult) {
  try {
    const webhookUrl = process.env.DISCORD_PATCH_NOTES_WEBHOOK_URL
      || process.env.DISCORD_COMMUNITY_WEBHOOK_URL
      || process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    const summary = post.content.replace(/<[^>]+>/g, "").trim().slice(0, 1000)
      || "새로운 배그 소식이 게시판에 등록되었습니다.";
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const notification = fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        embeds: [{
          title: `🆕 [배그 소식] ${post.title}`,
          description: summary.slice(0, 2000),
          url: `${siteUrl}/board/${post.post_id}`,
          thumbnail: post.image_url ? { url: post.image_url } : undefined,
          color: 0xf2a900,
          footer: { text: "BGMS 통합 지도 봇 | 업데이트 알리미" },
          timestamp: new Date().toISOString(),
        }],
      }),
    });
    const timeout = new Promise<void>((resolve) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        resolve();
      }, DISCORD_NOTIFICATION_TIMEOUT_MS);
    });
    try {
      await Promise.race([notification.catch(() => undefined), timeout]);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  } catch {
    // Discord 전달 실패는 이미 커밋된 승격 결과를 되돌리지 않는다.
  }
}

export async function POST(request: Request) {
  const auth = await withAuthGuard();
  if (auth.error) return auth.error;
  const { user, supabaseAdmin } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const input = parseRequestBody(body);
  if (!input) return NextResponse.json({ error: "필수 입력 데이터가 올바르지 않습니다." }, { status: 400 });

  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profileError) return NextResponse.json({ error: "게시글을 승격하지 못했습니다." }, { status: 503 });
    if (profile?.role !== "admin") return NextResponse.json({ error: "어드민 권한이 필요합니다." }, { status: 403 });

    const { data, error } = await supabaseAdmin.rpc("merge_board_post_draft_with_images", {
      p_draft_post_id: input.postId,
      p_actor_user_id: user.id,
      p_expected_parent_revision: input.expectedParentRevision,
    });
    if (error || !Array.isArray(data) || data.length !== 1 || !isPromoteResult(data[0])) {
      return NextResponse.json({ error: "게시글을 승격하지 못했습니다." }, { status: 503 });
    }
    const result = data[0];
    if (result.result_code !== "ok") {
      if (result.result_code === "revision_conflict") {
        return NextResponse.json({ error: "게시글이 다른 곳에서 수정되었습니다." }, { status: 409 });
      }
      if (result.result_code === "forbidden") return NextResponse.json({ error: "어드민 권한이 필요합니다." }, { status: 403 });
      if (result.result_code === "not_found") return NextResponse.json({ error: "승격할 초안 게시글을 찾을 수 없습니다." }, { status: 404 });
      return NextResponse.json({ error: "이미 승격(발행)된 게시글입니다." }, { status: 409 });
    }

    await sendDiscordNotification(result);
    return NextResponse.json({
      success: true,
      message: "수정 사항이 원본 게시글에 성공적으로 반영되었습니다.",
      data: { id: result.post_id, revision: result.revision },
    });
  } catch {
    return NextResponse.json({ error: "게시글을 승격하지 못했습니다." }, { status: 503 });
  }
}
