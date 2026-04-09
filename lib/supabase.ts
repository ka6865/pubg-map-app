/**
 * @fileoverview Supabase 클라이언트 설정 (최종 안전 모드)
 * 모든 환경 변수의 따옴표와 공백을 완전히 제거하여 인증 무반응 이슈를 원천 차단합니다.
 */
import { createClient } from '@supabase/supabase-js';

// 따옴표와 공백을 완전히 제거하는 유틸리티
const clean = (val: string | undefined) => (val || '').replace(/['";\s]+/g, '').trim();

const supabaseUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] CRITICAL: 환경 변수 누락');
}

console.log('[Supabase] Initializing with URL:', supabaseUrl);

// 가장 안정적인 기본 클라이언트 사용 (SSR 의존성 제거로 예측 가능성 확보)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'bgms-auth-token-v2', // 새로운 키로 캐시 충돌 방지
  }
});