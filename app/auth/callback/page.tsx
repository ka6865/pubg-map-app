'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';

/**
 * @fileoverview OAuth 인증 콜백 페이지 (SEO 최적화 버전)
 * 루트(/)의 서버 리다이렉트를 건너뛰고 최종 목적지(/maps/erangel)로 직행하여 
 * 인증 데이터 유실 문제를 방지합니다.
 */
export default function AuthCallbackPage() {
  const isProcessing = useRef(false);

  useEffect(() => {
    if (isProcessing.current) return;
    isProcessing.current = true;

    const handleAuth = async () => {
      console.log('[AuthCallback] 인증 처리 시작 (SEO 최적화 경로)...');
      
      // 1. 최대 2초간 세션이 나타날 때까지 대기 (Polling)
      let session = null;
      for (let i = 0; i < 4; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          session = data.session;
          break;
        }
        await new Promise(res => setTimeout(res, 500));
      }
      
      // 2. 최종 목적지 결정 (루트를 거치지 않고 바로 맵 페이지로)
      const targetPath = '/maps/erangel';
      
      if (session) {
        console.log('[AuthCallback] 인증 확인 성공:', session.user.email);
        // 세션 데이터가 브라우저 스토리지에 완전히 써지는 시간을 벌기 위해 미세 지연 추가
        setTimeout(() => {
          window.location.href = targetPath;
        }, 200);
      } else {
        console.warn('[AuthCallback] 세션 감지 실패. 안전하게 기본 경로로 이동합니다.');
        window.location.href = targetPath;
      }
    };

    handleAuth();
  }, []);

  return (
    <div style={{ 
      height: '100dvh', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      backgroundColor: '#0d0d0d',
      color: 'white',
      gap: '24px'
    }}>
      <div className="animate-spin" style={{ 
        width: '40px', 
        height: '40px', 
        border: '4px solid rgba(242, 169, 0, 0.1)', 
        borderTopColor: '#F2A900', 
        borderRadius: '50%' 
      }} />
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>BGMS 보안 연결 중</h2>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>잠시 후 전술 지도로 이동합니다...</p>
      </div>
    </div>
  );
}
