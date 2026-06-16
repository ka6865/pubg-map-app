import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { withOptionalAuth } from "@/utils/supabase/guard";
import { checkProfanity } from "@/lib/board/profanityFilter";
import { extractClientIp, checkIpBlacklist } from "@/lib/board/ipUtils";

/**
 * @fileoverview 비회원 댓글 생성 API
 *
 * 회원 댓글은 기존 클라이언트 직접 삽입 방식을 유지하고,
 * 비회원 댓글은 이 라우트를 통해 IP 차단 확인 → 비속어 필터 → 비밀번호 해싱 → 저장 순으로 처리합니다.
 * 캡차 검증은 세션 기반으로 클라이언트에서 사전 통과한 경우에만 호출됩니다.
 */
export async function POST(request: Request) {
  try {
    const auth = await withOptionalAuth();
    if (auth.error) return auth.error;
    const { supabaseAdmin } = auth;

    const body = await request.json();
    const { post_id, author, password, content, parent_id } = body;

    if (!post_id || !author?.trim() || !password || !content?.trim()) {
      return NextResponse.json({ error: "필수 입력값이 누락되었습니다." }, { status: 400 });
    }
    if (author.trim().length > 20) {
      return NextResponse.json({ error: "닉네임은 20자 이하로 입력해주세요." }, { status: 400 });
    }
    if (password.length < 4 || password.length > 20) {
      return NextResponse.json({ error: "비밀번호는 4~20자로 입력해주세요." }, { status: 400 });
    }

    // 1. IP 차단 확인
    const clientIp = extractClientIp(request);
    const isBlocked = await checkIpBlacklist(clientIp, supabaseAdmin);
    if (isBlocked) {
      return NextResponse.json({ error: "차단된 IP입니다. 관리자에게 문의해주세요." }, { status: 403 });
    }

    // 2. 1차 비속어 필터
    const profanityCheck = checkProfanity(content);
    if (profanityCheck.blocked) {
      return NextResponse.json({ error: "부적절한 표현이 포함되어 있습니다. 내용을 수정해주세요." }, { status: 400 });
    }
    const authorCheck = checkProfanity(author);
    if (authorCheck.blocked) {
      return NextResponse.json({ error: "닉네임에 부적절한 표현이 포함되어 있습니다." }, { status: 400 });
    }

    // 3. 비밀번호 단방향 해싱
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. 비회원 댓글 저장 (service_role로 RLS 우회)
    const { data, error } = await supabaseAdmin
      .from("comments")
      .insert([{
        post_id: Number(post_id),
        user_id: null,
        author: author.trim(),
        content: content.trim(),
        parent_id: parent_id ? Number(parent_id) : null,
        password_hash: passwordHash,
        ip_address: clientIp,
      }])
      .select()
      .single();

    if (error) {
      console.error("[Guest Comment Create] DB error:", error);
      return NextResponse.json({ error: "댓글 저장 중 오류가 발생했습니다." }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("[Guest Comment Create] Unexpected error:", err);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
