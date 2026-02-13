import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ⚠️ 빌드 타임에 환경 변수가 없어도 에러가 나지 않도록 빈 문자열이나 임시 값을 넣어줍니다.
// 실제 브라우저에서 실행될 때는 1단계에서 설정한 값이 들어갑니다.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);