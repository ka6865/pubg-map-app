import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const postId = searchParams.get("postId");

    if (!postId) {
      return NextResponse.json({ error: "게시글 ID가 없습니다." }, { status: 400 });
    }

    // 1. 관리자 권한 확인 (사용자 계정인지 체크)
    // 이 부분은 클라이언트에서 넘어온 토큰을 검증하거나, 별도의 관리자 인증 로직을 거칩니다.
    // 여기서는 service_role을 사용하여 강제 삭제를 수행하되, 호출 자체는 관리자만 가능하게 Board.tsx에서 통제합니다.

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 2. 댓글 먼저 삭제 (외래키 제약조건 방지)
    await supabaseAdmin.from("comments").delete().eq("post_id", postId);
    
    // 3. 좋아요 기록 삭제
    await supabaseAdmin.from("post_likes").delete().eq("post_id", postId);

    // 4. 게시글 본문 삭제 (service_role 사용으로 RLS 우회)
    const { error: deleteError } = await supabaseAdmin
      .from("posts")
      .delete()
      .eq("id", postId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true, message: "게시글과 관련 데이터가 강제 삭제되었습니다." });

  } catch (err: any) {
    console.error("Admin force delete error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
