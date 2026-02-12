'use client';

import { useEffect, useState } from 'react';
// 에러 수정: '@/lib/supabase' 대신 상대 경로 사용
import { supabase } from '../../lib/supabase';

export default function DebugPage() {
  const [envStatus, setEnvStatus] = useState<any>({});
  const [connectionStatus, setConnectionStatus] = useState('연결 테스트 중...');
  const [errorDetails, setErrorDetails] = useState('');

  useEffect(() => {
    // 1. 환경 변수가 브라우저에 잘 전달되었는지 확인 (보안상 일부만 보여줌)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    setEnvStatus({
      supabaseUrl: url ? `✅ 확인됨 (${url.substring(0, 15)}...)` : '❌ 없음 (설정 필요!)',
      supabaseKey: key ? `✅ 확인됨 (시작: ${key.substring(0, 5)}...)` : '❌ 없음 (설정 필요!)',
    });

    // 2. 실제 Supabase 연결 테스트
    const checkConnection = async () => {
      try {
        // 가장 가벼운 요청 보내보기
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        setConnectionStatus('✅ Supabase 연결 성공! (인터넷/설정 모두 정상)');
      } catch (e: any) {
        setConnectionStatus('❌ 연결 실패');
        setErrorDetails(e.message);
      }
    };

    checkConnection();
  }, []);

  return (
    <div style={{ padding: '40px', backgroundColor: '#111', color: 'white', minHeight: '100vh', fontFamily: 'monospace' }}>
      <h1 style={{ color: '#F2A900', fontSize: '24px', marginBottom: '20px' }}>🔧 배포 상태 진단 보고서</h1>
      
      <div style={{ marginBottom: '30px', padding: '20px', border: '1px solid #333', borderRadius: '8px' }}>
        <h3 style={{ borderBottom: '1px solid #555', paddingBottom: '10px' }}>1. 환경 변수 체크 (Vercel 설정)</h3>
        <p><strong>URL:</strong> {envStatus.supabaseUrl}</p>
        <p><strong>KEY:</strong> {envStatus.supabaseKey}</p>
        {(!envStatus.supabaseUrl || !envStatus.supabaseKey) && (
          <p style={{ color: '#ff4d4d', marginTop: '10px' }}>
            🚨 <strong>주의:</strong> 환경 변수가 '없음'으로 나오면 Vercel 설정에서 
            변수명 앞에 <code>NEXT_PUBLIC_</code>이 붙어있는지 꼭 확인하세요!
          </p>
        )}
      </div>

      <div style={{ padding: '20px', border: '1px solid #333', borderRadius: '8px' }}>
        <h3 style={{ borderBottom: '1px solid #555', paddingBottom: '10px' }}>2. 서버 연결 테스트</h3>
        <p style={{ fontSize: '18px', fontWeight: 'bold' }}>{connectionStatus}</p>
        {errorDetails && (
          <div style={{ marginTop: '10px', color: '#ff4d4d', backgroundColor: 'rgba(255,0,0,0.1)', padding: '10px' }}>
            에러 내용: {errorDetails}
          </div>
        )}
      </div>
      
      <div style={{ marginTop: '30px' }}>
         <a href="/" style={{ color: '#aaa', textDecoration: 'underline' }}>← 홈으로 돌아가기</a>
      </div>
    </div>
  );
}