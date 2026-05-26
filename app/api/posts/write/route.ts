import { NextResponse } from "next/server";
import { withAuthGuard } from "@/utils/supabase/guard";

/**
 * @fileoverview 게시판 저장을 서버사이드에서 처리하는 API입니다.
 * [보안] JWT 인증 가드를 적용하여 로그인된 사용자만 글쓰기/수정이 가능하며,
 * 요청의 user_id와 JWT 토큰에서 추출한 실제 사용자 ID를 교차 대조합니다.
 */

// 🌟 디스코드 서버 검증 상수
const ALLOWED_GUILD_ID = "1486899870928470121";

async function validateDiscordUrl(url: string): Promise<boolean> {
  if (!url) return true;

  try {
    // 1. 단축 초대 링크 형식 (discord.gg/code 또는 discord.com/invite/code)
    const inviteMatch = url.match(/(?:discord\.gg\/|discord\.com\/invite\/)([a-zA-Z0-9-]+)/);
    if (inviteMatch) {
      const code = inviteMatch[1];
      const res = await fetch(`https://discord.com/api/v10/invites/${code}`);
      if (!res.ok) return false;
      const data = await res.json();
      return data.guild?.id === ALLOWED_GUILD_ID;
    }

    // 2. 상세 채널 링크 형식 (discord.com/channels/guild_id/channel_id)
    const channelMatch = url.match(/discord\.com\/channels\/(\d+)\/\d+/);
    if (channelMatch) {
      const guildId = channelMatch[1];
      return guildId === ALLOWED_GUILD_ID;
    }

    // 그 외 형식은 일단 허용하지 않음 (보안)
    return false;
  } catch (err) {
    console.error("Discord validation error:", err);
    return false;
  }
}

export async function POST(request: Request) {
  try {
    // 🔒 [보안] JWT 인증 가드 — 로그인된 사용자만 글쓰기/수정 허용
    const auth = await withAuthGuard();
    if (auth.error) return auth.error;
    const { user, supabaseAdmin } = auth;

    const body = await request.json();
    const {
      title,
      content,
      category,
      image_url,
      is_notice,
      author,
      user_id,
      editingPostId,
      discord_url, // 🌟 추가
      discord_channel_id, // 🌟 추가
      clan_info, // 🌟 추가
    } = body;

    if (!title || !content || !user_id) {
      return NextResponse.json(
        { error: "필수 입력 데이터가 누락되었습니다." },
        { status: 400 }
      );
    }

    // 🔒 [보안] JWT에서 추출한 실제 사용자 ID와 요청의 user_id 교차 대조
    // 관리자가 아닌 일반 사용자는 본인의 user_id만 사용 가능
    const { data: requesterProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isRequesterAdmin = requesterProfile?.role === "admin";

    if (user_id !== user.id && !isRequesterAdmin) {
      console.warn(`⚠️ [Auth Guard] JWT user ${user.id} tried to impersonate ${user_id}`);
      return NextResponse.json(
        { error: "인증된 사용자와 요청자가 일치하지 않습니다." },
        { status: 403 }
      );
    }

    // 🌟 [보안] 본문 크기 제한 (DB 안정성 확보용)
    if (content.length > 300000) {
      return NextResponse.json(
        { error: "게시글 용량이 너무 큽니다. 불필요한 이미지 데이터를 제거해 주세요." },
        { status: 413 }
      );
    }

    // 🌟 [검증] 디스코드 링크 유효성 체크
    if (category === "듀오/스쿼드 모집" && discord_url) {
      const isValid = await validateDiscordUrl(discord_url);
      if (!isValid) {
        return NextResponse.json(
          { error: "BGMS 공식 디스코드 서버의 초대 링크 또는 채널 링크만 등록할 수 있습니다." },
          { status: 400 }
        );
      }
    }

    if (editingPostId) {
      // 1. [보안] 수정 시 실제 소유자 확인 및 이전 데이터 로드 (이미지 정리용)
      const { data: existingPost, error: fetchError } = await supabaseAdmin
        .from("posts")
        .select("user_id, content")
        .eq("id", editingPostId)
        .single();

      if (fetchError || !existingPost) {
        return NextResponse.json(
          { error: "수정할 게시글을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      // 🔒 [권한 확인] 게시글 소유자 검증 (JWT 가드에서 이미 추출한 isRequesterAdmin 재사용)
      if (existingPost.user_id !== user.id && !isRequesterAdmin) {
        console.warn(`⚠️ [Permission Denied] User ${user.id} tried to edit post ${editingPostId} owned by ${existingPost.user_id}`);
        return NextResponse.json(
          { error: "게시글 수정 권한이 없습니다." },
          { status: 403 }
        );
      }

      console.log(`✅ [Permission Granted] User ${user.id} (Admin: ${isRequesterAdmin}) editing post ${editingPostId}`);

      // 🌟 [서버사이드 이미지 정리] 삭제된 이미지 감지 및 스토리지 폐기
      try {
        const imgRegex = /<img[^>]+src\s*=\s*["']?([^"'\s>]+)["']?/g;
        const oldImages = [...(existingPost.content || "").matchAll(imgRegex)].map(m => m[1]);
        const newImages = [...(content || "").matchAll(imgRegex)].map(m => m[1]);
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
        // 이미지 정리 실패가 포스트 수정을 막지는 않도록 함
      }

      // 2. 게시글 업데이트
      const { data, error: updateError } = await supabaseAdmin
        .from("posts")
        .update({
          title,
          content,
          category,
          image_url,
          is_notice,
          discord_url, // 🌟 필드 업데이트 추가
          discord_channel_id, // 🌟 필드 업데이트 추가
          clan_info, // 🌟 클랜 정보 업데이트 추가
        })
        .eq("id", editingPostId)
        .select();

      if (updateError) {
        console.error("🚨 [Update Error]:", updateError);
        throw updateError;
      }
      return NextResponse.json({ success: true, data: data[0] });
    } else {
      // 3. 신규 게시글 등록
      const { data, error: insertError } = await supabaseAdmin
        .from("posts")
        .insert([
          {
            title,
            content,
            author,
            user_id,
            category,
            image_url,
            discord_url, // 🌟 필드 삽입 추가
            discord_channel_id, // 🌟 필드 삽입 추가
            is_notice,
            clan_info, // 🌟 클랜 정보 삽입 추가
          },
        ])
        .select();

      if (insertError) throw insertError;
      return NextResponse.json({ success: true, data: data[0] });
    }
  } catch (err: any) {
    console.error("🚨 [Post Write API Error]:", err);
    return NextResponse.json(
      { error: err.message || "서버 내부 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
