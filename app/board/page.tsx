'use client';

import Link from 'next/link';

const MOCK_POSTS = [
  { id: 1, title: '에란겔 차고지 위치 제보합니다', author: '배그고수', date: '2026-02-10', views: 120 },
  { id: 2, title: '미라마 황금미라도 고정젠인가요?', author: '뉴비123', date: '2026-02-09', views: 85 },
  { id: 3, title: '같이 듀오 하실 분 구함 (2000+)', author: '여포', date: '2026-02-09', views: 342 },
];

export default function BoardPage() {
  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: '#0b0f19', color: 'white', fontFamily: 'sans-serif' }}>
      <header style={{ height: '60px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 20px', backgroundColor: '#1a1a1a' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
           <div style={{ fontSize: '24px', fontWeight: '900', fontStyle: 'italic', color: '#F2A900', cursor: 'pointer' }}>
            PUBG<span style={{ color: 'white' }}>MAP</span> <span style={{ fontSize: '14px', color: '#888', fontStyle: 'normal' }}>Community</span>
           </div>
        </Link>
      </header>
      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold' }}>자유 게시판</h1>
          <button style={{ padding: '10px 20px', backgroundColor: '#F2A900', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>글쓰기</button>
        </div>
        <div style={{ borderTop: '2px solid #F2A900' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #333', color: '#888', fontSize: '14px' }}>
                <th style={{ padding: '15px' }}>번호</th><th style={{ padding: '15px' }}>제목</th><th style={{ padding: '15px' }}>작성자</th><th style={{ padding: '15px' }}>날짜</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_POSTS.map((post) => (
                <tr key={post.id} style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ padding: '15px', color: '#666' }}>{post.id}</td>
                  <td style={{ padding: '15px', fontWeight: 'bold' }}>{post.title}</td>
                  <td style={{ padding: '15px', color: '#aaa' }}>{post.author}</td>
                  <td style={{ padding: '15px', color: '#666' }}>{post.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}