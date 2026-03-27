// app/api/admin/approve/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    // 1. 헤더에서 유저 JWT 토큰 가져오기 (보안)
    const authHeader = request.headers.get("authorization");
    if (!authHeader) return NextResponse.json({ error: "인증 토큰이 없습니다." }, { status: 401 });
    const token = authHeader.replace("Bearer ", "");
    
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "마커 ID가 누락되었습니다." }, { status: 400 });

    // 2. 서버용 마스터키 클라이언트 세팅
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3. 토큰으로 진짜 유저 검증
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "로그인이 만료되었거나 유효하지 않습니다." }, { status: 401 });

    // 4. DB에서 진짜 Admin 뱃지가 있는지 검증 (가장 중요!)
    const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") return NextResponse.json({ error: "관리자 권한이 없습니다." }, { status: 403 });

    // --- 이후 승인 로직 (기존과 동일) ---
    const { data: pending, error: fetchError } = await supabaseAdmin
      .from("pending_markers")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !pending) {
      return NextResponse.json({ error: "이미 다른 관리자가 처리했거나 없는 제보입니다." }, { status: 404 });
    }

    const { data: newIdData, error: rpcError } = await supabaseAdmin.rpc(
      "get_next_marker_id",
      {
        map_id_in: pending.map_name,
        marker_type_in: pending.marker_type,
      }
    );

    if (rpcError) throw rpcError;
    const newId = newIdData;

    const { error: insertError } = await supabaseAdmin
      .from("map_markers")
      .insert({
        id: newId,
        map_id: pending.map_name,
        name: pending.marker_type,
        type: pending.marker_type,
        x: pending.x,
        y: pending.y,
      });

    if (insertError) throw insertError;
    await supabaseAdmin.from("pending_markers").delete().eq("id", id);

    return NextResponse.json({ success: true, newId });
  } catch (error: any) {
    console.error("승인 API 에러:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
