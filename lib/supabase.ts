/**
 * @fileoverview Supabase 클라이언트 인스턴스를 생성하고 내보내는 유틸리티 파일입니다.
 * 브라우저 환경에서 Next.js와 Supabase를 연동하여 인증 및 DB 작업에 사용됩니다.
 */
import { createBrowserClient } from '@supabase/ssr';

// 프로젝트 환경 변수 내 Supabase 접속 URL 및 권한 키 할당
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase 환경 변수가 설정되지 않았습니다. .env 파일을 확인해 주세요.');
}

// 브라우저용 Supabase 클라이언트 내보내기 (쿠키 연동 지원)
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);