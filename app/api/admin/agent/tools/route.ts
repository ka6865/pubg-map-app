import { NextResponse } from "next/server";
import { buildAgentToolCatalog } from "@/lib/admin-agent/tool-catalog";
import { verifyAdminRole } from "@/lib/admin-agent/logging";
import { withAuthGuard } from "@/utils/supabase/guard";

export async function GET() {
  const auth = await withAuthGuard();
  if (auth.error) return auth.error;
  const { supabaseAdmin: supabase, user } = auth;

  const adminError = await verifyAdminRole(supabase, user.id);
  if (adminError) return adminError;

  return NextResponse.json({ catalog: buildAgentToolCatalog() });
}
