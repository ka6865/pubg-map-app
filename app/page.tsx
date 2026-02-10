'use client';

import dynamic from 'next/dynamic';

// 🌟 핵심: ssr: false 옵션이 있어야 "window is not defined" 에러가 안 납니다.
// 경로 주의: components 폴더가 app 폴더와 같은 위치에 있다고 가정합니다.
const Map = dynamic(() => import('../components/Map'), {
  ssr: false,
  loading: () => (
    <div style={{ width: '100%', height: '100vh', backgroundColor: '#0b0f19', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p>전장 진입 중...</p>
    </div>
  )
});

export default function Home() {
  return (
    <main style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
      <Map />
    </main>
  );
}