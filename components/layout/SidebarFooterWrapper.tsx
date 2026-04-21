'use client';

import { usePathname } from 'next/navigation';
import Footer from '../common/Footer';

/**
 * 지도 페이지와 일반 페이지의 레이아웃(푸터 노출 여부 등)을 
 * 현재 경로에 따라 동적으로 처리하는 래퍼 컴포넌트입니다.
 */
export default function SidebarFooterWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // 메인 홈(/) 또는 상세 지도(/maps/...) 경로인 경우 지도 레이아웃으로 간주
  const isMapPage = pathname === '/' || pathname.startsWith('/maps/');

  return (
    <>
      <main className={`flex-grow relative flex flex-col ${isMapPage ? 'overflow-hidden h-[calc(100dvh-56px)]' : 'overflow-visible'}`}>
        {children}
      </main>
      {/* 지도 페이지가 아닐 때만 하단 글로벌 푸터를 노출하여 스크롤 트랩 방지 */}
      {!isMapPage && <Footer />}
    </>
  );
}
