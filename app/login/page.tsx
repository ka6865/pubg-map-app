'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function LoginPage() {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`로그인 시도: ${id} (아직 서버가 없어서 로그인은 안 돼요!)`);
  };

  return (
    <div style={{ width: '100%', height: '100vh', backgroundColor: '#0b0f19', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ width: '400px', padding: '40px', backgroundColor: '#1a1a1a', borderRadius: '8px', border: '1px solid #333', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
        <h1 style={{ textAlign: 'center', fontSize: '32px', fontWeight: '900', fontStyle: 'italic', marginBottom: '30px', color: '#F2A900' }}>
          PUBG<span style={{ color: 'white' }}>MAP</span>
        </h1>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input type="text" placeholder="아이디" value={id} onChange={(e) => setId(e.target.value)} style={{ padding: '15px', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#252525', color: 'white' }} />
          <input type="password" placeholder="비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} style={{ padding: '15px', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#252525', color: 'white' }} />
          <button type="submit" style={{ padding: '15px', borderRadius: '4px', border: 'none', backgroundColor: '#F2A900', color: 'black', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', marginTop: '10px' }}>로그인</button>
        </form>
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <Link href="/" style={{ color: '#888', textDecoration: 'none', fontSize: '12px' }}>← 지도로 돌아가기</Link>
        </div>
      </div>
    </div>
  );
}