import { NextResponse } from "next/server";
import { verifyAdminRole } from "@/lib/admin-agent/logging";
import { runAgentSelfTest } from "@/lib/admin-agent/self-test";
import { withAuthGuard } from "@/utils/supabase/guard";

export async function GET() {
  const auth = await withAuthGuard();
  if (auth.error) return auth.error;
  const { supabaseAdmin: supabase, user } = auth;

  const adminError = await verifyAdminRole(supabase, user.id);
  if (adminError) return adminError;

  const selfTest = await runAgentSelfTest(supabase);
  return NextResponse.json({ selfTest });
}
