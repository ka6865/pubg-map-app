import { NextResponse } from "next/server";
import { verifyAdminRole } from "@/lib/admin-agent/logging";
import { withAuthGuard } from "@/utils/supabase/guard";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const auth = await withAuthGuard();
  if (auth.error) return auth.error;
  const { supabaseAdmin: supabase, user } = auth;

  const adminError = await verifyAdminRole(supabase, user.id);
  if (adminError) return adminError;

  const { id } = await context.params;
  const { data: run, error: runError } = await supabase
    .from("agent_runs")
    .select("id, user_id, status, message, summary, error, started_at, completed_at")
    .eq("id", id)
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: runError?.message || "agent run을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: steps, error: stepsError } = await supabase
    .from("agent_steps")
    .select("id, run_id, tool_name, safety_level, status, params, result, error, started_at, completed_at")
    .eq("run_id", id)
    .order("started_at", { ascending: true });

  if (stepsError) return NextResponse.json({ error: stepsError.message }, { status: 500 });
  return NextResponse.json({ run, steps: steps || [] });
}
