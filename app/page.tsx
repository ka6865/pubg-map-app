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
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "BGMS",
      "url": "https://bgms.kr",
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://bgms.kr/?q={search_term_string}",
        "query-input": "required name=search_term_string"
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "BGMS - 배틀그라운드 통합 전술 지도",
      "description": "에란겔, 미라마, 태이고 론도 등 배틀그라운드 모든 맵의 차량 스폰 위치 및 텔레메트리 정보를 제공하는 전문 전술 플랫폼입니다.",
      "applicationCategory": "GameApplication",
      "operatingSystem": "Web",
      "author": {
        "@type": "Organization",
        "name": "BGMS Team",
        "url": "https://bgms.kr"
      },
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "KRW"
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "에란겔 지도",
          "item": "https://bgms.kr/?tab=Erangel"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "미라마 지도",
          "item": "https://bgms.kr/?tab=Miramar"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "태이고 지도",
          "item": "https://bgms.kr/?tab=Taego"
        }
      ]
    }
  ];

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