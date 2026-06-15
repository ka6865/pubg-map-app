import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createServerClient } from '@supabase/ssr';

// Vercel envs 클린 유틸리티 (서버 전용)
const clean = (val: string | undefined) => (val || '').replace(/['";\s]+/g, '').trim();

export async function POST(req: NextRequest) {
  try {
    // 1. 현재 사용자 세션 확인
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: '인증되지 않았거나 잘못된 세션입니다. 다시 로그인해 주세요.' },
        { status: 401 }
      );
    }

    // 2. 어드민(Service Role) 권한을 가진 Supabase 클라이언트 생성
    const supabaseUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: '서버 환경 변수가 누락되었습니다. 관리자에게 문의해 주세요.' },
        { status: 500 }
      );
    }

    const adminClient = createServerClient(
      supabaseUrl,
      serviceRoleKey,
      {
        cookies: {
          getAll() { return []; },
          setAll() {}
        }
      }
    );

    // 3. auth.users 테이블에서 사용자 삭제
    // ON DELETE CASCADE 제약조건에 의해 public.profiles는 자동 삭제되며,
    // posts와 comments 테이블의 user_id는 ON DELETE SET NULL에 의해 익명화 처리됩니다.
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      return NextResponse.json(
        { error: `계정 삭제에 실패했습니다: ${deleteError.message}` },
        { status: 500 }
      );
    }

    // 4. 로컬 세션 쿠키 정리 (Sign Out 호출)
    await supabase.auth.signOut();

    return NextResponse.json(
      { success: true, message: '회원탈퇴가 성공적으로 완료되었습니다. 데이터가 익명화 처리되었습니다.' },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: `서버 내부 오류가 발생했습니다: ${error.message}` },
      { status: 500 }
    );
  }
}
