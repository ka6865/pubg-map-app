// Supabase 클라이언트 생성 모듈 로드
import { createClient } from '@supabase/supabase-js';

// 프로젝트 환경 변수 내 Supabase 접속 URL 및 권한 키 할당
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// DB, 스토리지, 사용자 인증 통신을 위한 단일 Supabase 인스턴스 내보내기
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);