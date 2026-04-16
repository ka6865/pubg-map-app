import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const postId = searchParams.get("postId");

    if (!postId) {
      return NextResponse.json({ error: "게시글 ID가 없습니다." }, { status: 400 });
    }

    // 1. 보안 리팩토링: 서버가 직접 쿠키에서 유저 세션을 해독하여 관리자 여부를 철저하게 검증합니다.
    const supabaseServer = await createClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    
    if (!user) {
      console.warn("🔒 [Delete] Unauthorized attempt - No user found in session.");
      return NextResponse.json({ error: "🔒 인증되지 않은 접근입니다. 다시 로그인해 주세요." }, { status: 401 });
    }

    console.log(`👤 [Delete] User found: ${user.email} (${user.id})`);

    const { data: profile, error: profileError } = await supabaseServer.from("profiles").select("role").eq("id", user.id).single();
    
    if (profileError || !profile) {
      console.error("❌ [Delete] Profile fetch error:", profileError);
      return NextResponse.json({ error: "프로필 정보를 불러올 수 없습니다." }, { status: 500 });
    }

    if (profile.role !== "admin") {
      console.warn(`⛔ [Delete] Permission denied: User role is ${profile.role}`);
      return NextResponse.json({ error: `⛔ 관리자 권한이 없습니다. (현재: ${profile.role})` }, { status: 403 });
    }

    // 검증이 완료된 경우에만 Service Role을 사용하여 우회 삭제를 수행합니다.
    const supabaseAdmin = createSupabaseAdminClient(supabaseUrl, supabaseServiceKey);
    const numericPostId = parseInt(postId, 10);

    console.log(`🗑️ [Delete] Proceeding to delete Post ID: ${numericPostId}`);

    // 2. 댓글 먼저 삭제 (외래키 제약조건 방지)
    const { error: commError } = await supabaseAdmin.from("comments").delete().eq("post_id", numericPostId);
    if (commError) console.warn("⚠️ Comment delete warning:", commError.message);
    
    // 3. 좋아요 기록 삭제
    const { error: likeError } = await supabaseAdmin.from("post_likes").delete().eq("post_id", numericPostId);
    if (likeError) console.warn("⚠️ Likes delete warning:", likeError.message);

    // 4. 게시글 본문 삭제 (service_role 사용으로 RLS 우회)
    const { data: deleteData, error: deleteError } = await supabaseAdmin
      .from("posts")
      .delete()
      .eq("id", numericPostId)
      .select();

    if (deleteError) {
      console.error("🚨 [Delete] Post delete error:", deleteError);
      throw deleteError;
    }

    if (!deleteData || deleteData.length === 0) {
      console.warn(`⚠️ [Delete] Post ${numericPostId} not found in DB.`);
      return NextResponse.json({ error: "이미 삭제되었거나 존재하지 않는 게시글입니다." }, { status: 404 });
    }

    console.log(`✅ [Delete] Success: Post ${numericPostId} and related data removed.`);
    return NextResponse.json({ success: true, message: "게시글과 관련 데이터가 강제 삭제되었습니다." });

  } catch (err: any) {
    console.error("Admin force delete error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
