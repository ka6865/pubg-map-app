import { NextResponse } from "next/server";
import { normalizeApproval, summarizeApprovalQueue } from "@/lib/admin-agent/approvals";
import { buildApprovalExecutionGate, calculateApprovalImpact } from "@/lib/admin-agent/impact";
import { verifyAdminRole } from "@/lib/admin-agent/logging";
import { withAuthGuard } from "@/utils/supabase/guard";

export async function GET() {
  const auth = await withAuthGuard();
  if (auth.error) return auth.error;
  const { supabaseAdmin: supabase, user } = auth;

  const adminError = await verifyAdminRole(supabase, user.id);
  if (adminError) return adminError;

  const { data, error } = await supabase
    .from("agent_approvals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const approvals = await Promise.all(
    (data || []).map(async (approval: any) => {
      const impact = await calculateApprovalImpact(supabase, approval.action_type, approval.payload || {});
      return {
        ...approval,
        queue: normalizeApproval(approval),
        impact: {
          ...impact,
          executionGate: buildApprovalExecutionGate(approval.action_type, approval.payload || {}, impact)
        }
      };
    })
  );

  return NextResponse.json({
    approvals,
    summary: summarizeApprovalQueue(approvals.map((approval: any) => approval.queue))
  });
}
