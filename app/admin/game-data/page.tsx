'use client';

import dynamic from 'next/dynamic';

const GameDataEditor = dynamic(() => import('../../../components/admin/GameDataEditor'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center text-white font-bold">
      관리자 권한 확인 및 로딩 중...
    </div>
  )
});

export default function AdminGameDataPage() {
  return (
    <main className="min-h-screen bg-[#0b0f19]">
      <GameDataEditor />
    </main>
  );
}
