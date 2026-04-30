/**
 * @fileoverview Supabase 클라이언트 설정 (최종 안전 모드)
 * 모든 환경 변수의 따옴표와 공백을 완전히 제거하여 인증 무반응 이슈를 원천 차단합니다.
 */


// 따옴표와 공백을 완전히 제거하는 유틸리티
const clean = (val: string | undefined) => (val || '').replace(/['";\s]+/g, '').trim();

const supabaseUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] CRITICAL: 환경 변수 누락');
}

import { createClient } from '../utils/supabase/client';

// console.log('[Supabase] Initializing SSR Browser Client...');

// SSR 쿠키 동기화가 내장된 브라우저 클라이언트를 기본으로 내보냅니다.
// 이전처럼 storageKey('bgms-auth-token-v2') 등을 써서 localStorage에 고립시키지 않습니다.
export const supabase = createClient();