'use client';

import dynamic from 'next/dynamic';

// Leaflet은 window 객체가 필요하므로 SSR을 비활성화해야 합니다.
const MapEditor = dynamic(() => import('../../components/MapEditor'), {
  ssr: false,
  loading: () => <div className="w-full h-screen bg-[#0f172a] flex items-center justify-center text-white font-bold">로딩 중...</div>
});

export default function Page() {
  return <MapEditor />;
}