'use client';

import dynamic from 'next/dynamic';

// 1. 사용자용 (Viewer) - 사이드바가 있는 완성된 지도
const MapViewer = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => <div className="text-white text-center pt-20">전장 진입 중... (사용자 모드)</div>
});

// 2. 관리자용 (Editor) - 마커를 찍고 데이터를 뽑는 도구
// ⚠️ 주의: components 폴더에 MapEditor.tsx 파일이 있어야 합니다!
const MapEditor = dynamic(() => import('@/components/MapEditor'), {
  ssr: false,
  loading: () => <div className="text-red-400 text-center pt-20 font-bold">🛠️ 관리자 도구 로딩 중...</div>
});

export default function Home() {
  
  // 👇 [핵심] 이 변수만 바꾸면 모드가 변신합니다!
  // true  = 관리자 모드 (마커 찍기, 데이터 내보내기)
  // false = 사용자 모드 (사이드바, 보기 전용)
  const isAdminMode = false; 

  return (
    <main>
      {isAdminMode ? <MapEditor /> : <MapViewer />}
    </main>
  );
}