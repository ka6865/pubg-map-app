'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const GameDataEditor = dynamic(() => import('../../../components/admin/GameDataEditor'), {
  ssr: false,
});

export default function AdminGameDataPage() {
  return (
    <main className="min-h-screen bg-[#0b0f19]">
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center text-[#F2A900] font-bold">
          관리자 권한 확인 및 에디터 로딩 중...
        </div>
      }>
        <GameDataEditor />
      </Suspense>
    </main>
  );
}
