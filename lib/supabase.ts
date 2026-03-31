// Supabase 클라이언트 생성 모듈 로드
import { createBrowserClient } from '@supabase/ssr';

// 프로젝트 환경 변수 내 Supabase 접속 URL 및 권한 키 할당
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase 환경 변수가 설정되지 않았습니다. .env 파일을 확인해 주세요.');
}

// 브라우저용 Supabase 클라이언트 내보내기 (쿠키 연동 지원)
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);