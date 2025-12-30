'use client';

import dynamic from 'next/dynamic';

// SSR(서버 렌더링) 끄기 - 지도는 브라우저에서만 돌아감
const MapComponent = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => <div className="text-white text-center pt-20">전장 진입 중...</div>
});

export default function Home() {
  return (
    <main>
      <MapComponent />
    </main>
  );
}