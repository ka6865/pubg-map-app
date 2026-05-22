import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Clean utility to safely strip any accidental quotes or trailing spaces from Vercel envs
const clean = (val: string | undefined) =>
  (val || "").replace(/['";\\s]+/g, "").trim();

/**
 * @fileoverview Supabase JWT 인증 기반 하이브리드 서버 가드
 *
 * 서버 Route Handler(app/api)에서 로그인 세션을 검증하고,
 * 인증된 사용자만 데이터 변경(CUD) 작업을 수행할 수 있도록 방어합니다.
 *
 * 반환값:
 * - 인증 성공 시: { user, supabaseAdmin } (Service Role 클라이언트 포함)
 * - 인증 실패 시: { error: NextResponse } (401 응답 객체)
 */

type AuthGuardSuccess = {
  user: { id: string; email?: string };
  supabaseAdmin: ReturnType<typeof createAdminClient<any>>;
  error?: undefined;
};

type AuthGuardFailure = {
  user?: undefined;
  supabaseAdmin?: undefined;
  error: NextResponse;
};

export type AuthGuardResult = AuthGuardSuccess | AuthGuardFailure;

export async function withAuthGuard(): Promise<AuthGuardResult> {
  try {
    const cookieStore = await cookies();

    // 1. 쿠키 기반 Supabase SSR 클라이언트로 JWT 세션 복원
    const supabase = createServerClient(
      clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set({ name, value, ...options })
              );
            } catch {
              // Server Component에서 호출된 경우 무시
            }
          },
        },
      }
    );

    // 2. JWT AccessToken을 복호화하여 실제 인증된 사용자 정보 확인
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        error: NextResponse.json(
          { error: "로그인이 필요합니다. 로그인 후 다시 시도해주세요." },
          { status: 401 }
        ),
      };
    }

    // 3. Service Role 클라이언트 생성 (DB 쓰기용, RLS 우회)
    const supabaseAdmin = createAdminClient<any>(
      clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    );

    return { user, supabaseAdmin };
  } catch (err) {
    console.error("[withAuthGuard] 인증 처리 중 예외:", err);
    return {
      error: NextResponse.json(
        { error: "인증 처리 중 오류가 발생했습니다." },
        { status: 500 }
      ),
    };
  }
}
