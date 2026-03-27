import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    // 보안 검증
    if (token !== process.env.ADMIN_SECRET_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 🌟 30일이 지난 pending 데이터 삭제 로직
    // 신뢰도가 낮고(예: 2점 미만) 생성된 지 30일이 넘은 데이터 색출
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data, error } = await supabaseAdmin
      .from("pending_markers")
      .delete()
      .lt("weight", 3) // 신뢰도 3점 미만이고
      .lt("created_at", thirtyDaysAgo.toISOString()) // 30일 넘은 것
      .select();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: `청소 완료: ${data?.length || 0}개의 유령 제보 삭제됨.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
