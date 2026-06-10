import { NextResponse } from "next/server";
import { buildContentPerformanceReport } from "@/lib/admin-agent/content-performance";
import { verifyAdminRole } from "@/lib/admin-agent/logging";
import { withAuthGuard } from "@/utils/supabase/guard";

export async function GET(request: Request) {
  const auth = await withAuthGuard();
  if (auth.error) return auth.error;
  const { supabaseAdmin: supabase, user } = auth;

  const adminError = await verifyAdminRole(supabase, user.id);
  if (adminError) return adminError;

  const { searchParams } = new URL(request.url);
  const report = await buildContentPerformanceReport(supabase, {
    days: Number(searchParams.get("days") || 30),
    limit: Number(searchParams.get("limit") || 50)
  });

  return NextResponse.json({ report });
}
