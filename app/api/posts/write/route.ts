import { NextResponse } from "next/server";
import { withOptionalAuth } from "@/utils/supabase/guard";
import { extractClientIp, checkIpBlacklist } from "@/lib/board/ipUtils";
import { checkProfanity } from "@/lib/board/profanityFilter";
import { consumeBoardWriteQuota } from "@/lib/board/writeQuota.server";
import { verifyTurnstileToken } from "@/lib/board/turnstile.server";
import { TURNSTILE_ACTIONS } from "@/lib/board/turnstileContract";
import bcrypt from "bcryptjs";

/**
 * @fileoverview 게시판 저장을 서버사이드에서 처리하는 API입니다.
 * 회원은 JWT 사용자 ID를, 비회원은 IP·Turnstile·비밀번호를 서버 신뢰 경계로 사용합니다.
 */

const ALLOWED_GUILD_ID = "1486899870928470121";
const TURNSTILE_TOKEN_MAX_LENGTH = 2048;
const TITLE_MAX_LENGTH = 50;
const GUEST_AUTHOR_MAX_LENGTH = 20;
const GUEST_PASSWORD_MIN_LENGTH = 4;
const GUEST_PASSWORD_MAX_LENGTH = 20;
const DISCORD_URL_MAX_LENGTH = 2048;

async function validateDiscordUrl(url: string): Promise<boolean> {
  if (!url) return true;

  try {
    const inviteMatch = url.match(/(?:discord\.gg\/|discord\.com\/invite\/)([a-zA-Z0-9-]+)/);
    if (inviteMatch) {
      const code = inviteMatch[1];
      const res = await fetch(`https://discord.com/api/v10/invites/${code}`);
      if (!res.ok) return false;
      const data = await res.json();
      return data.guild?.id === ALLOWED_GUILD_ID;
    }

    const channelMatch = url.match(/discord\.com\/channels\/(\d+)\/\d+/);
    if (channelMatch) {
      const guildId = channelMatch[1];
      return guildId === ALLOWED_GUILD_ID;
    }

    return false;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>;
    try {
      const value: unknown = await request.json();
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
      }
      body = value as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
    }
    const {
      title,
      content,
      category,
      image_url,
      is_notice,
      author,
      user_id,
      password,
      editingPostId,
      discord_url,
      discord_channel_id,
      clan_info,
      turnstileToken,
    } = body;

    if (
      typeof title !== "string"
      || !title.trim()
      || title.trim().length > TITLE_MAX_LENGTH
      || typeof content !== "string"
      || !content.trim()
      || typeof category !== "string"
      || !category.trim()
    ) {
      return NextResponse.json(
        { error: "필수 입력 데이터가 누락되었습니다." },
        { status: 400 }
      );
    }

    if (content.length > 300000) {
      return NextResponse.json(
        { error: "게시글 용량이 너무 큽니다. 불필요한 이미지 데이터를 제거해 주세요." },
        { status: 413 }
      );
    }
    if (
      discord_url != null
      && (typeof discord_url !== "string" || discord_url.length > DISCORD_URL_MAX_LENGTH)
    ) {
      return NextResponse.json({ error: "디스코드 링크가 올바르지 않습니다." }, { status: 400 });
    }
    if (
      editingPostId != null
      && (
        typeof editingPostId !== "number"
        || !Number.isInteger(editingPostId)
        || editingPostId <= 0
      )
    ) {
      return NextResponse.json({ error: "수정할 게시글 ID가 올바르지 않습니다." }, { status: 400 });
    }
    if (author != null && typeof author !== "string") {
      return NextResponse.json({ error: "작성자 정보가 올바르지 않습니다." }, { status: 400 });
    }
    if (
      password != null
      && (
        typeof password !== "string"
        || password.trim().length < GUEST_PASSWORD_MIN_LENGTH
        || password.length > GUEST_PASSWORD_MAX_LENGTH
      )
    ) {
      return NextResponse.json({ error: "비밀번호는 4~20자로 입력해주세요." }, { status: 400 });
    }
    if (
      typeof password === "string"
      && (
        typeof author !== "string"
        || !author.trim()
        || author.trim().length > GUEST_AUTHOR_MAX_LENGTH
      )
    ) {
      return NextResponse.json({ error: "닉네임은 20자 이하로 입력해주세요." }, { status: 400 });
    }
    const discordUrl = typeof discord_url === "string" ? discord_url : "";
    const guestPassword = typeof password === "string" ? password : "";

    const auth = await withOptionalAuth();
    if (auth.error) return auth.error;
    const { user, supabaseAdmin } = auth;

    let isRequesterAdmin = false;
    let memberAuthor = "익명";

    if (user) {
      const { data: requesterProfile } = await supabaseAdmin
        .from("profiles")
        .select("role, nickname")
        .eq("id", user.id)
        .single();

      isRequesterAdmin = requesterProfile?.role === "admin";
      memberAuthor = typeof requesterProfile?.nickname === "string" && requesterProfile.nickname.trim()
        ? requesterProfile.nickname.trim()
        : "익명";

      if (user_id !== user.id && !isRequesterAdmin) {
        return NextResponse.json(
          { error: "인증된 사용자와 요청자가 일치하지 않습니다." },
          { status: 403 }
        );
      }
    } else {
      if (!editingPostId) {
        if (typeof author !== "string" || typeof password !== "string") {
          return NextResponse.json(
            { error: "닉네임과 비밀번호를 입력해 주세요." },
            { status: 400 }
          );
        }
        const token = typeof turnstileToken === "string" ? turnstileToken.trim() : "";
        if (!token || token.length > TURNSTILE_TOKEN_MAX_LENGTH) {
          return NextResponse.json(
            { error: "보안 인증 토큰이 올바르지 않습니다." },
            { status: 400 },
          );
        }
      }
    }

    if (editingPostId) {
      if (!user) {
        return NextResponse.json(
          { error: "비회원 게시글은 수정이 불가합니다. 삭제 후 재작성해 주세요." },
          { status: 401 }
        );
      }

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

      if (existingPost.user_id !== user.id && !isRequesterAdmin) {
        return NextResponse.json(
          { error: "게시글 수정 권한이 없습니다." },
          { status: 403 }
        );
      }

      if (category === "듀오/스쿼드 모집" && discordUrl) {
        const isValid = await validateDiscordUrl(discordUrl);
        if (!isValid) {
          return NextResponse.json(
            { error: "BGMS 공식 디스코드 서버의 초대 링크 또는 채널 링크만 등록할 수 있습니다." },
            { status: 400 },
          );
        }
      }

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
          await supabaseAdmin.storage.from("images").remove(imagePathsToDelete);
        }
      } catch {
        // 정리 실패는 게시글 수정을 차단하지 않는다.
      }

      const { data, error: updateError } = await supabaseAdmin
        .from("posts")
        .update({
          title,
          content,
          category,
          image_url,
          ...(isRequesterAdmin ? { is_notice: is_notice === true } : {}),
          discord_url,
          discord_channel_id,
          clan_info,
        })
        .eq("id", editingPostId)
        .select();

      if (updateError) {
        throw updateError;
      }
      return NextResponse.json({ success: true, data: data[0] });
    } else {
      const finalAuthor = user ? memberAuthor : (author as string).trim();
      const finalUserId = user ? user.id : null;
      let passwordHash = null;
      const clientIp = extractClientIp(request);

      if (!user) {
        const isIpBlocked = await checkIpBlacklist(clientIp, supabaseAdmin);
        if (isIpBlocked) {
          return NextResponse.json(
            { error: "차단된 IP 대역에서는 글 작성이 불가합니다." },
            { status: 403 }
          );
        }
      }

      const quota = await consumeBoardWriteQuota({
        supabaseAdmin,
        scope: "post",
        actor: user?.id ?? clientIp,
      });
      if (!quota.ok) {
        return NextResponse.json({ error: quota.error }, { status: quota.status });
      }

      if (!user) {
        const turnstile = await verifyTurnstileToken({
          token: turnstileToken,
          remoteIp: clientIp,
          expectedAction: TURNSTILE_ACTIONS.post,
        });
        if (!turnstile.ok) {
          return NextResponse.json({ error: turnstile.error }, { status: turnstile.status });
        }
      }

      if (category === "듀오/스쿼드 모집" && discordUrl) {
        const isValid = await validateDiscordUrl(discordUrl);
        if (!isValid) {
          return NextResponse.json(
            { error: "BGMS 공식 디스코드 서버의 초대 링크 또는 채널 링크만 등록할 수 있습니다." },
            { status: 400 },
          );
        }
      }

      if (!user) {
        const titleProfanity = checkProfanity(title);
        const contentProfanity = checkProfanity(content);
        if (titleProfanity.blocked || contentProfanity.blocked) {
          return NextResponse.json(
            { error: "제목 또는 본문에 비속어가 포함되어 있어 작성이 차단되었습니다." },
            { status: 400 }
          );
        }

        const salt = await bcrypt.genSalt(10);
        passwordHash = await bcrypt.hash(guestPassword, salt);
      }

      const { data, error: insertError } = await supabaseAdmin
        .from("posts")
        .insert([
          {
            title,
            content,
            author: finalAuthor,
            user_id: finalUserId,
            category,
            image_url,
            discord_url,
            discord_channel_id,
            is_notice: isRequesterAdmin ? is_notice === true : false,
            clan_info,
            password_hash: passwordHash,
            ip_address: clientIp,
          },
        ])
        .select();

      if (insertError) throw insertError;
      return NextResponse.json({ success: true, data: data[0] });
    }

  } catch {
    return NextResponse.json(
      { error: "서버 내부 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
