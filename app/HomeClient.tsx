'use client';

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

interface HomeClientProps {
  jsonLd: any[];
}

export default function HomeClient({ jsonLd }: HomeClientProps) {
  return (
    <main style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
      {/* SEO용 숨김 제목 */}
      <h1 className="sr-only">BGMS | 배틀그라운드(PUBG) 통합 지도 및 전술 분석 도구</h1>
      
      {/* 구조화된 데이터 (JSON-LD) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Map />
    </main>
  );
}
