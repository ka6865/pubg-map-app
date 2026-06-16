import { NextResponse } from "next/server";

/**
 * @fileoverview Cloudflare Turnstile 서버사이드 토큰 검증 API
 *
 * 클라이언트에서 캡차 통과 후 받은 token을 이 라우트로 전달하면
 * Cloudflare 서버에 secret key로 검증 요청을 보내 결과를 반환합니다.
 * 검증 성공 시 클라이언트는 sessionStorage에 플래그를 저장하여
 * 동일 탭 내에서는 재검증 없이 글쓰기/댓글을 허용합니다.
 */

export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ success: false, error: "토큰이 없습니다." }, { status: 400 });
    }

    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json({ success: false, error: "서버 설정 오류" }, { status: 500 });
    }

    // Cloudflare Turnstile 서버사이드 검증
    const formData = new FormData();
    formData.append("secret", secretKey);
    formData.append("response", token);

    const verifyRes = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: formData }
    );

    const outcome = await verifyRes.json();

    if (outcome.success) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: "보안 인증에 실패했습니다. 다시 시도해주세요." },
      { status: 400 }
    );
  } catch (err) {
    console.error("[Turnstile Verify] Error:", err);
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
