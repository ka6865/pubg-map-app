import { NextResponse } from "next/server";
import { verifyAdminRole } from "@/lib/admin-agent/logging";
import { withAuthGuard } from "@/utils/supabase/guard";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const auth = await withAuthGuard();
  if (auth.error) return auth.error;
  const { supabaseAdmin: supabase, user } = auth;

  const adminError = await verifyAdminRole(supabase, user.id);
  if (adminError) return adminError;

  const { id } = await context.params;
  const { data: memory, error: lookupError } = await supabase
    .from("agent_memories")
    .select("metadata")
    .eq("id", id)
    .single();

  if (lookupError || !memory) {
    return NextResponse.json({ error: lookupError?.message || "memory를 찾을 수 없습니다." }, { status: 404 });
  }

  const { error } = await supabase
    .from("agent_memories")
    .update({
      metadata: {
        ...(memory.metadata || {}),
        active: false,
        deactivatedBy: user.id,
        deactivatedAt: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
