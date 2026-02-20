'use client';

import { supabase } from '../../lib/supabase';

export default function Login() {
  // 소셜 로그인 처리 함수 (구글, 카카오 공용)
  const handleSocialLogin = async (provider: 'google' | 'kakao') => {
    // [핵심] 로그인 끝나고 돌아올 주소를 현재 도메인으로 자동 설정
    // 이렇게 하면 로컬(localhost)이랑 배포(vercel) 환경 구분 안 해도 알아서 잘 돌아옵니다.
    const redirectTo = window.location.origin;

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline', // 구글: 나중에 토큰 갱신하려고 받음
          prompt: 'consent',      // 구글: 로그인할 때마다 계정 선택창 뜨게 함 (편의성)
        },
      },
    });

    if (error) {
      alert(`${provider} 로그인 실패: ` + error.message);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      // 100vh 대신 100dvh를 써야 모바일 주소창 때문에 화면 아래가 짤리는걸 막을 수 있음
      height: '100dvh', 
      backgroundColor: '#121212', 
      color: 'white',
      padding: '20px'
    }}>
      <div style={{ 
        width: '100%', 
        maxWidth: '360px', 
        padding: '50px 30px', 
        backgroundColor: '#1a1a1a', 
        borderRadius: '16px', 
        border: '1px solid #333', 
        textAlign: 'center',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
      }}>
        {/* 서비스 로고 영역 */}
        <h2 style={{ 
          marginBottom: '15px', 
          fontSize: '32px', 
          fontWeight: '900', 
          fontStyle: 'italic', 
          color: 'black', 
          textShadow: '-1px -1px 0 #F2A900, 1px -1px 0 #F2A900, -1px 1px 0 #F2A900, 1px 1px 0 #F2A900',
          letterSpacing: '-1px'
        }}>
          PUBG<span style={{ color: 'white', textShadow: 'none' }}>MAP</span>
        </h2>
        
        <p style={{ color: '#888', fontSize: '15px', marginBottom: '40px', lineHeight: '1.5' }}>
          복잡한 가입 절차 없이<br />
          <strong>SNS 계정</strong>으로 3초 만에 시작하세요.
        </p>

        {/* 로그인 버튼 목록 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* 🟡 카카오 로그인 버튼 */}
          <button 
            onClick={() => handleSocialLogin('kakao')}
            style={{ 
              width: '100%', padding: '14px', backgroundColor: '#FEE500', color: '#000', fontWeight: 'bold', 
              border: 'none', borderRadius: '8px', cursor: 'pointer', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '15px' 
            }}
          >
            {/* 카카오 심볼 아이콘 */}
            <svg viewBox="0 0 24 24" width="20" height="20" fill="black"><path d="M12 3C5.925 3 1 6.925 1 11.775c0 3.375 2.325 6.3 5.85 7.725-.225.825-.825 3-1.05 3.45 0 0-.15.3.15.375.3.075.45-.075.75-.375 3.225-2.175 4.5-2.85 6.3-2.85 6.075 0 11-3.925 11-8.775C24 6.925 18.675 3 12 3z"/></svg>
            카카오로 계속하기
          </button>

          {/* ⚪ 구글 로그인 버튼 */}
          <button 
            onClick={() => handleSocialLogin('google')}
            style={{ 
              width: '100%', padding: '14px', backgroundColor: 'white', color: '#333', fontWeight: 'bold', 
              border: 'none', borderRadius: '8px', cursor: 'pointer', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '15px' 
            }}
          >
            {/* 구글 G 아이콘 */}
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            구글로 계속하기
          </button>
        </div>

        <div style={{ marginTop: '30px', fontSize: '12px', color: '#555' }}>
          로그인 시 이용약관 및 개인정보처리방침에 동의하게 됩니다.
        </div>
      </div>
    </div>
  );
}