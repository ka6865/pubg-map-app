'use client';

// Next.js 동적 컴포넌트 로드 모듈
import dynamic from 'next/dynamic';

// 메인 지도 컴포넌트 동적 로드 (SSR 비활성화 및 로딩 UI 지정)
const Map = dynamic(() => import('../components/Map'), {
  ssr: false,
  loading: () => (
    <div style={{ width: '100%', height: '100vh', backgroundColor: '#0b0f19', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p>전장 진입 중...</p>
    </div>
  )
});

// 메인 페이지 진입점 컴포넌트
export default function Home() {
  return (
    <main style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
      <Map />
    </main>
  );
}