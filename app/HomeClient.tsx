'use client';

import dynamic from 'next/dynamic';
import JsonLd from '@/components/seo/JsonLd';
import { JsonLdProps } from '@/types/seo';

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
  jsonLd?: JsonLdProps | JsonLdProps[];
  initialMapId?: string;
  postId?: string;
  initialIsWriting?: boolean;
}

export default function HomeClient({ jsonLd, initialMapId, postId, initialIsWriting }: HomeClientProps) {
  return (
    <main style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
      {/* SEO용 숨김 제목 */}
      <h1 className="sr-only">BGMS | 배틀그라운드(PUBG) 고젠 및 고정 차량 위치 통합 분석 지도</h1>
      
      {/* 구조화된 데이터 (JSON-LD) */}
      {jsonLd && <JsonLd data={jsonLd} />}

      <Map initialMapId={initialMapId} postId={postId} initialIsWriting={initialIsWriting} />
    </main>
  );
}
