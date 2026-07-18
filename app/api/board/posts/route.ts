import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { withOptionalAuth } from "@/utils/supabase/guard";
import { checkProfanity } from "@/lib/board/profanityFilter";
import { extractClientIp, checkIpBlacklist } from "@/lib/board/ipUtils";
import { consumeBoardWriteQuota } from "@/lib/board/writeQuota.server";
import { verifyTurnstileToken } from "@/lib/board/turnstile.server";
import { TURNSTILE_ACTIONS } from "@/lib/board/turnstileContract";

/**
 * @fileoverview 비회원 게시글 생성 API
 *
 * 호환성을 위해 유지하며 모든 요청을 비회원 작성으로 처리합니다.
 */

const TURNSTILE_TOKEN_MAX_LENGTH = 2048;
const TITLE_MAX_LENGTH = 50;
const CATEGORY_MAX_LENGTH = 50;

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
    const { title, content, author, password, category, turnstileToken } = body;

    if (
      typeof title !== "string" || !title.trim()
      || typeof content !== "string" || !content.trim()
      || typeof author !== "string" || !author.trim()
      || typeof password !== "string" || !password
      || typeof category !== "string" || !category.trim()
    ) {
      return NextResponse.json({ error: "필수 입력값이 누락되었습니다." }, { status: 400 });
    }
    if (author.trim().length > 20) {
      return NextResponse.json({ error: "닉네임은 20자 이하로 입력해주세요." }, { status: 400 });
    }
    if (password.length < 4 || password.length > 20) {
      return NextResponse.json({ error: "비밀번호는 4~20자로 입력해주세요." }, { status: 400 });
    }
    if (content.length > 300000) {
      return NextResponse.json({ error: "게시글 용량이 너무 큽니다." }, { status: 413 });
    }
    if (title.trim().length > TITLE_MAX_LENGTH) {
      return NextResponse.json({ error: "제목은 50자 이하로 입력해주세요." }, { status: 400 });
    }
    if (category.trim().length > CATEGORY_MAX_LENGTH) {
      return NextResponse.json({ error: "카테고리는 50자 이하로 입력해주세요." }, { status: 400 });
    }
    const safeTitle = title.trim();
    const safeContent = content.trim();
    const safeCategory = category.trim();
    const token = typeof turnstileToken === "string" ? turnstileToken.trim() : "";
    if (!token || token.length > TURNSTILE_TOKEN_MAX_LENGTH) {
      return NextResponse.json(
        { error: "보안 인증 토큰이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const auth = await withOptionalAuth();
    if (auth.error) return auth.error;
    const { supabaseAdmin } = auth;

    const clientIp = extractClientIp(request);
    const isBlocked = await checkIpBlacklist(clientIp, supabaseAdmin);
    if (isBlocked) {
      return NextResponse.json({ error: "차단된 IP입니다. 관리자에게 문의해주세요." }, { status: 403 });
    }

    const quota = await consumeBoardWriteQuota({
      supabaseAdmin,
      scope: "post",
      actor: clientIp,
    });
    if (!quota.ok) {
      return NextResponse.json({ error: quota.error }, { status: quota.status });
    }

    const turnstile = await verifyTurnstileToken({
      token,
      remoteIp: clientIp,
      expectedAction: TURNSTILE_ACTIONS.post,
    });
    if (!turnstile.ok) {
      return NextResponse.json({ error: turnstile.error }, { status: turnstile.status });
    }

    const titleCheck = checkProfanity(safeTitle);
    if (titleCheck.blocked) {
      return NextResponse.json({ error: "제목에 부적절한 표현이 포함되어 있습니다." }, { status: 400 });
    }
    const contentCheck = checkProfanity(safeContent);
    if (contentCheck.blocked) {
      return NextResponse.json({ error: "본문에 부적절한 표현이 포함되어 있습니다." }, { status: 400 });
    }
    const authorCheck = checkProfanity(author);
    if (authorCheck.blocked) {
      return NextResponse.json({ error: "닉네임에 부적절한 표현이 포함되어 있습니다." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data, error } = await supabaseAdmin
      .from("posts")
      .insert([{
        title: safeTitle,
        content: safeContent,
        author: author.trim(),
        user_id: null,
        category: safeCategory,
        status: "published",
        password_hash: passwordHash,
        ip_address: clientIp,
        is_notice: false,
        views: 0,
        likes: 0,
      }])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "게시글 저장 중 오류가 발생했습니다." }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
