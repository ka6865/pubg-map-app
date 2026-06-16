import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { withOptionalAuth } from "@/utils/supabase/guard";
import { checkProfanity } from "@/lib/board/profanityFilter";
import { extractClientIp, checkIpBlacklist } from "@/lib/board/ipUtils";

/**
 * @fileoverview 비회원 게시글 생성 API
 *
 * 기존 /api/posts/write 는 로그인 필수(withAuthGuard)이므로,
 * 비회원 글쓰기는 이 라우트를 통해 별도 처리합니다.
 * IP 차단 확인 → 비속어 필터 → 비밀번호 해싱 → 저장 파이프라인을 적용합니다.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  try {
    const auth = await withOptionalAuth();
    if (auth.error) return auth.error;
    const { supabaseAdmin } = auth;

    const body = await request.json();
    const { title, content, author, password, category } = body;

    if (!title?.trim() || !content?.trim() || !author?.trim() || !password || !category) {
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

    // 1. IP 차단 확인
    const clientIp = extractClientIp(request);
    const isBlocked = await checkIpBlacklist(clientIp, supabaseAdmin);
    if (isBlocked) {
      return NextResponse.json({ error: "차단된 IP입니다. 관리자에게 문의해주세요." }, { status: 403 });
    }

    // 2. 1차 비속어 필터
    const titleCheck = checkProfanity(title);
    if (titleCheck.blocked) {
      return NextResponse.json({ error: "제목에 부적절한 표현이 포함되어 있습니다." }, { status: 400 });
    }
    const contentCheck = checkProfanity(content);
    if (contentCheck.blocked) {
      return NextResponse.json({ error: "본문에 부적절한 표현이 포함되어 있습니다." }, { status: 400 });
    }
    const authorCheck = checkProfanity(author);
    if (authorCheck.blocked) {
      return NextResponse.json({ error: "닉네임에 부적절한 표현이 포함되어 있습니다." }, { status: 400 });
    }

    // 3. 비밀번호 단방향 해싱
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. 비회원 게시글 저장 (service_role로 RLS 우회)
    const { data, error } = await supabaseAdmin
      .from("posts")
      .insert([{
        title: title.trim(),
        content: content.trim(),
        author: author.trim(),
        user_id: null,
        category,
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
      console.error("[Guest Post Create] DB error:", error);
      return NextResponse.json({ error: "게시글 저장 중 오류가 발생했습니다." }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[Guest Post Create] Unexpected error:", err);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
