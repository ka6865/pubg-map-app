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
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "배틀그라운드 통합 지도",
    "description": "에란겔, 미라마, 태이고 등 배틀그라운드 모든 맵의 차량 스폰 위치 및 전략 정보를 제공하는 도구입니다.",
    "applicationCategory": "GameApplication",
    "operatingSystem": "Web",
    "author": {
      "@type": "Organization",
      "name": "PUBG Map Team"
    },
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "KRW"
    }
  };

  return (
    <main style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
      {/* SEO용 숨김 제목 */}
      <h1 className="sr-only">배틀그라운드 모든 맵 차량 스폰 위치 및 전략 지도</h1>
      
      {/* 구조화된 데이터 (JSON-LD) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Map />
    </main>
  );
}