import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * @fileoverview 게시판 저장을 서버사이드에서 우회(Bypass) 처리하는 API입니다.
 * 브라우저 직접 통신 시 발생하는 원인 모를 타임아웃 문제를 해결하기 위해 도입되었습니다.
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
    } = body;

    if (!title || !content || !user_id) {
      return NextResponse.json(
        { error: "필수 입력 데이터가 누락되었습니다." },
        { status: 400 }
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

    // 관리자(Service Role) 권한으로 DB 클라이언트 초기화 (RLS 우회)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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

      // 🌟 [권한 확인] 요청자 프로필 로드 (관리자 여부 확인용)
      const { data: requesterProfile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", user_id)
        .single();

      const isRequesterAdmin = requesterProfile?.role === "admin";

      if (existingPost.user_id !== user_id && !isRequesterAdmin) {
        console.warn(`⚠️ [Permission Denied] User ${user_id} tried to edit post ${editingPostId} owned by ${existingPost.user_id}`);
        return NextResponse.json(
          { error: "게시글 수정 권한이 없습니다." },
          { status: 403 }
        );
      }

      console.log(`✅ [Permission Granted] User ${user_id} (Admin: ${isRequesterAdmin}) editing post ${editingPostId}`);

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
