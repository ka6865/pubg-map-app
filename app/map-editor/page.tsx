'use client';

// Next.js 동적 컴포넌트 로드 모듈
import dynamic from 'next/dynamic';

// Leaflet 라이브러리 window 객체 의존성 해결을 위해 SSR(서버 사이드 렌더링) 비활성화 적용
const MapEditor = dynamic(() => import('../../components/MapEditor'), {
  ssr: false,
  loading: () => <div className="w-full h-screen bg-[#0f172a] flex items-center justify-center text-white font-bold">로딩 중...</div>
});

// 맵 에디터 페이지 진입점 컴포넌트
export default function Page() {
  return <MapEditor />;
}