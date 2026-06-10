import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { verifyAdminRole } from "@/lib/admin-agent/logging";
import { buildAgentRolloutReadiness } from "@/lib/admin-agent/rollout";
import { withAuthGuard } from "@/utils/supabase/guard";

const clean = (value: string | undefined) => (value || "").replace(/['";\s]+/g, "").trim();

export async function GET(request: Request) {
  const cronAuth = resolveCronAuth(request);
  if (cronAuth) {
    return NextResponse.json({ rollout: await buildAgentRolloutReadiness(cronAuth.supabase), source: "cron" });
  }

  const auth = await withAuthGuard();
  if (auth.error) return auth.error;
  const { supabaseAdmin: supabase, user } = auth;

  const adminError = await verifyAdminRole(supabase, user.id);
  if (adminError) return adminError;

  return NextResponse.json({ rollout: await buildAgentRolloutReadiness(supabase), source: "manual" });
}

function resolveCronAuth(request: Request) {
  const cronSecret = process.env.ADMIN_AGENT_CRON_SECRET || process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") || "";
  const headerSecret = request.headers.get("x-admin-agent-secret") || "";
  const providedSecret = authorization.replace(/^Bearer\s+/i, "") || headerSecret;

  if (!cronSecret || providedSecret !== cronSecret) return null;

  return {
    supabase: createSupabaseAdminClient(
      clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    )
  };
}
