// app/api/admin/reject/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });
    const token = authHeader.replace("Bearer ", "");
    
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "마커 ID가 누락되었습니다." }, { status: 400 });

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "로그인이 만료되었거나 유효하지 않습니다." }, { status: 401 });

    const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") return NextResponse.json({ error: "관리자 권한이 없습니다." }, { status: 403 });

    const { error: deleteError } = await supabaseAdmin
      .from("pending_markers")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("파기 API 에러:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
