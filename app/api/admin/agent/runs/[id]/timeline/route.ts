import { NextResponse } from "next/server";
import { verifyAdminRole } from "@/lib/admin-agent/logging";
import { buildAgentRunTimeline } from "@/lib/admin-agent/timeline";
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

  const [stepsResult, approvalsResult] = await Promise.all([
    supabase
      .from("agent_steps")
      .select("id, run_id, tool_name, safety_level, status, params, result, error, started_at, completed_at")
      .eq("run_id", id)
      .order("started_at", { ascending: true }),
    supabase
      .from("agent_approvals")
      .select("id, run_id, step_id, tool_name, action_type, status, payload, result, error, created_at, decided_at, executed_at")
      .eq("run_id", id)
      .order("created_at", { ascending: true })
  ]);

  if (stepsResult.error) return NextResponse.json({ error: stepsResult.error.message }, { status: 500 });
  if (approvalsResult.error) return NextResponse.json({ error: approvalsResult.error.message }, { status: 500 });

  const steps = stepsResult.data || [];
  const approvals = approvalsResult.data || [];
  const markdown = buildAgentRunTimeline({ run, steps, approvals });

  return NextResponse.json({
    run,
    steps,
    approvals,
    markdown
  });
}
