"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Leaflet 지도는 브라우저 환경에서만 동작하므로 dynamic import로 SSR을 비활성화합니다.
const TestMap = dynamic(() => import("./TestMapClient"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen bg-neutral-950 text-white flex items-center justify-center font-bold">
      <p className="animate-pulse">검증용 전장 생성 중...</p>
    </div>
  )
});

export default function TestCoordinatePage() {
  return (
    <main className="w-full h-screen overflow-hidden relative bg-[#0b0f19]">
      <h1 className="sr-only">PUBG 좌표 캘리브레이션 테스트 벤치</h1>
      <TestMap />
    </main>
  );
}
