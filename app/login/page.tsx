'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false); // 로그인/회원가입 모드 전환

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (isSignUp) {
      // 회원가입
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) {
        alert('가입 실패: ' + error.message);
      } else {
        alert('회원가입 확인 메일을 보냈습니다! 이메일을 확인해주세요.');
      }
    } else {
      // 로그인
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        alert('로그인 실패: ' + error.message);
      } else {
        router.push('/'); // 메인으로 이동
        router.refresh(); // 상태 갱신
      }
    }
    setIsLoading(false);
  };

  const handleGoogleLogin = async () => {
    // 🌟 핵심 수정 사항: 현재 브라우저의 주소를 동적으로 가져옵니다.
    // 로컬에서는 http://localhost:3000, 배포 후에는 https://...vercel.app이 됩니다.
    const redirectTo = window.location.origin;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo, // 동적으로 감지된 주소 사용
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      alert('구글 로그인 에러: ' + error.message);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#121212', color: 'white' }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '40px', backgroundColor: '#1a1a1a', borderRadius: '8px', border: '1px solid #333' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '30px', fontSize: '24px', fontWeight: 'bold', color: '#F2A900' }}>
          PUBG<span style={{ color: 'white' }}>MAP</span> {isSignUp ? '회원가입' : '로그인'}
        </h2>

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#aaa' }}>이메일</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: '100%', padding: '12px', backgroundColor: '#252525', border: '1px solid #333', color: 'white', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#aaa' }}>비밀번호</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: '100%', padding: '12px', backgroundColor: '#252525', border: '1px solid #333', color: 'white', borderRadius: '4px' }}
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            style={{ marginTop: '10px', padding: '14px', backgroundColor: '#F2A900', color: 'black', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}
          >
            {isLoading ? '처리 중...' : (isSignUp ? '가입하기' : '로그인')}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', margin: '25px 0' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#333' }}></div>
          <span style={{ padding: '0 10px', fontSize: '12px', color: '#666' }}>또는</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#333' }}></div>
        </div>

        <button 
          onClick={handleGoogleLogin}
          style={{ width: '100%', padding: '12px', backgroundColor: 'white', color: '#333', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Google 계정으로 계속하기
        </button>

        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '13px', color: '#aaa' }}>
          {isSignUp ? '이미 계정이 있으신가요? ' : '아직 계정이 없으신가요? '}
          <button 
            onClick={() => setIsSignUp(!isSignUp)} 
            style={{ background: 'none', border: 'none', color: '#F2A900', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {isSignUp ? '로그인하기' : '회원가입하기'}
          </button>
        </div>
      </div>
    </div>
  );
}