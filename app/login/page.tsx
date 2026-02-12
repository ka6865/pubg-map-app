'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
// 🌟 Supabase 연결 통로 가져오기 (이 경로가 맞아야 합니다)
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // 🖱️ [기능 1] 이메일 로그인
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); // 새로고침 방지
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert('로그인 실패: ' + error.message);
    } else {
      alert('로그인 성공!');
      router.push('/');
    }
    
    setLoading(false);
  };

  // 🖱️ [기능 2] 이메일 회원가입
  const handleSignUp = async () => {
    if (!email || !password) return alert('이메일과 비밀번호를 입력해주세요.');
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    
    if (error) {
      alert('회원가입 실패: ' + error.message);
    } else {
      alert('회원가입 성공! 이제 [로그인] 버튼을 눌러주세요.');
    }
    
    setLoading(false);
  };

  // 🌟 [기능 3] 구글 로그인 (새로 추가됨!)
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // 로그인 성공 시 다시 돌아올 우리 사이트 주소
        redirectTo: `${window.location.origin}/`, 
      },
    });

    if (error) {
      alert('구글 로그인 에러: ' + error.message);
    }
    // 성공하면 구글 로그인 창으로 자동으로 넘어갑니다!
  };

  return (
    <div style={{ width: '100%', height: '100vh', backgroundColor: '#0b0f19', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ width: '400px', padding: '40px', backgroundColor: '#1a1a1a', borderRadius: '8px', border: '1px solid #333', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
        <h1 style={{ textAlign: 'center', fontSize: '32px', fontWeight: '900', fontStyle: 'italic', marginBottom: '30px', color: '#F2A900' }}>
          PUBG<span style={{ color: 'white' }}>MAP</span>
        </h1>
        
        {/* 이메일 로그인 폼 */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input 
            type="email" 
            placeholder="이메일 (test@test.com 형식)" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            style={{ padding: '15px', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#252525', color: 'white' }} 
          />
          <input 
            type="password" 
            placeholder="비밀번호 (6자리 이상)" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            style={{ padding: '15px', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#252525', color: 'white' }} 
          />
          <button 
            type="submit" 
            disabled={loading} 
            style={{ padding: '15px', borderRadius: '4px', border: 'none', backgroundColor: '#F2A900', color: 'black', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', marginTop: '10px', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? '처리 중...' : '이메일로 로그인'}
          </button>
          <button 
            type="button" 
            onClick={handleSignUp} 
            disabled={loading} 
            style={{ padding: '15px', borderRadius: '4px', border: '1px solid #F2A900', backgroundColor: 'transparent', color: '#F2A900', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}
          >
             이메일로 1초 회원가입
          </button>
        </form>

        {/* 구분선 */}
        <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: '#666', fontSize: '12px' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#333' }}></div>
          <span style={{ margin: '0 10px' }}>또는</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#333' }}></div>
        </div>

        {/* 🌟 구글 로그인 버튼 */}
        <button 
          onClick={handleGoogleLogin} 
          style={{ width: '100%', padding: '15px', borderRadius: '4px', border: '1px solid white', backgroundColor: 'white', color: 'black', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
        >
          {/* 구글 G 로고 (간단한 SVG) */}
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            <path d="M1 1h22v22H1z" fill="none"/>
          </svg>
          Google 계정으로 계속하기
        </button>
        
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <Link href="/" style={{ color: '#888', textDecoration: 'none', fontSize: '12px' }}>← 지도로 돌아가기</Link>
        </div>
      </div>
    </div>
  );
}