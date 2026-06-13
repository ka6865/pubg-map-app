import { NextResponse } from "next/server";
import { withAuthGuard } from "@/utils/supabase/guard";

/**
 * @fileoverview 게시판 초안(draft)을 실제 게시판에 승격 및 병합 처리하는 API입니다.
 * [보안] JWT 인증 가드 및 어드민 롤(admin role)을 반드시 검증합니다.
 */

export async function POST(request: Request) {
  try {
    // 🔒 [보안] JWT 인증 가드 적용
    const auth = await withAuthGuard();
    if (auth.error) return auth.error;
    const { user, supabaseAdmin } = auth;

    // 🔒 [권한 확인] 어드민 롤 검증
    const { data: requesterProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (requesterProfile?.role !== "admin") {
      console.warn(`⚠️ [Permission Denied] Non-admin user ${user.id} tried to promote post`);
      return NextResponse.json(
        { error: "어드민 권한이 필요합니다." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { postId } = body;

    if (!postId) {
      return NextResponse.json(
        { error: "필수 입력 데이터(postId)가 누락되었습니다." },
        { status: 400 }
      );
    }

    // 1. 초안 게시글 조회
    const { data: postDraft, error: fetchError } = await supabaseAdmin
      .from("posts")
      .select("*")
      .eq("id", postId)
      .single();

    if (fetchError || !postDraft) {
      return NextResponse.json(
        { error: "승격할 초안 게시글을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (postDraft.status !== "draft") {
      return NextResponse.json(
        { error: "이미 승격(발행)된 게시글입니다." },
        { status: 400 }
      );
    }

    // 2. 승격 및 병합(Merge) 분기 처리
    if (postDraft.parent_id) {
      // [Shadow Draft 병합] parent_id가 가리키는 원본 게시글을 초안 정보로 업데이트하고 초안 삭제
      console.log(`🌿 [Shadow Draft Promote] Merging draft ${postId} into parent ${postDraft.parent_id}`);
      
      // 기존 원본 글의 content 획득 (이미지 대조 및 클린업용)
      const { data: existingPost } = await supabaseAdmin
        .from("posts")
        .select("content")
        .eq("id", postDraft.parent_id)
        .single();

      // 🌟 [서버사이드 이미지 정리] 원본에 병합 시 사용하지 않게 된 미사용 이미지 파일 스토리지 정리
      if (existingPost) {
        try {
          const imgRegex = /<img[^>]+src\s*=\s*["']?([^"'\s>]+)["']?/g;
          const oldImages = [...(existingPost.content || "").matchAll(imgRegex)].map(m => m[1]);
          const newImages = [...(postDraft.content || "").matchAll(imgRegex)].map(m => m[1]);
          const deletedImages = oldImages.filter(src => !newImages.includes(src));

          const imagePathsToDelete = deletedImages
            .map(src => {
              if (src.includes("/storage/v1/object/public/images/")) {
                const path = src.split("/storage/v1/object/public/images/")[1];
                return path ? decodeURIComponent(path) : null;
              }
              return null;
            })
            .filter((path): path is string => path !== null);

          if (imagePathsToDelete.length > 0) {
            console.log("🧹 [Server Storage Cleanup]:", imagePathsToDelete);
            await supabaseAdmin.storage.from("images").remove(imagePathsToDelete);
          }
        } catch (cleanupErr) {
          console.error("⚠️ [Cleanup Error]:", cleanupErr);
        }
      }

      // 원본 게시글 업데이트
      const { error: mergeError } = await supabaseAdmin
        .from("posts")
        .update({
          title: postDraft.title,
          content: postDraft.content,
          category: postDraft.category,
          image_url: postDraft.image_url,
          discord_url: postDraft.discord_url,
          discord_channel_id: postDraft.discord_channel_id,
          clan_info: postDraft.clan_info,
          is_notice: postDraft.is_notice,
          status: "published"
        })
        .eq("id", postDraft.parent_id);

      if (mergeError) {
        console.error("🚨 [Merge Error]:", mergeError);
        throw mergeError;
      }

      // 해당 원본(parent_id)을 바라보고 생성되었던 모든 수정 임시 초안(Shadow Drafts) 일괄 삭제
      const { error: deleteError } = await supabaseAdmin
        .from("posts")
        .delete()
        .eq("parent_id", postDraft.parent_id);

      if (deleteError) {
        console.error("🚨 [Draft Delete Error]:", deleteError);
      }

      return NextResponse.json({
        success: true,
        message: "수정 사항이 원본 게시글에 성공적으로 반영되었습니다.",
        data: { id: postDraft.parent_id }
      });
    } else {
      // [신규 초안 승격] parent_id가 없는 경우 status만 published로 수정
      console.log(`🌿 [New Draft Promote] Promoting draft ${postId} to published status`);
      
      const { data, error: promoteError } = await supabaseAdmin
        .from("posts")
        .update({ status: "published" })
        .eq("id", postId)
        .select();

      if (promoteError) {
        console.error("🚨 [Promote Error]:", promoteError);
        throw promoteError;
      }

      return NextResponse.json({
        success: true,
        message: "새 게시글이 성공적으로 발행되었습니다.",
        data: data[0]
      });
    }
  } catch (err: any) {
    console.error("🚨 [Post Promote API Error]:", err);
    return NextResponse.json(
      { error: err.message || "서버 내부 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
