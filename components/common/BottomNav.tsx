'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Map, BarChart2, MessageSquare, Menu } from 'lucide-react';
import GlobalMobileMenu from './GlobalMobileMenu';

export default function BottomNav() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeTab = searchParams?.get('tab') || 'Erangel';
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Close menu automatically only when route actually changes (using render-phase state update)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setIsMenuOpen(false);
  }

  const bottomNavItems = [
    { id: 'Home', label: '지도', icon: Map, onClick: () => router.push('/?tab=Erangel'), active: ['Erangel', 'Miramar', 'Taego', 'Rondo', 'Vikendi', 'Deston'].includes(activeTab) && pathname === '/' && !isMenuOpen },
    { id: 'Stats', label: '전적', icon: BarChart2, onClick: () => router.push('/?tab=Stats'), active: activeTab === 'Stats' && pathname === '/' && !isMenuOpen },
    { id: 'Board', label: '커뮤니티', icon: MessageSquare, onClick: () => router.push('/?tab=Board'), active: activeTab === 'Board' && pathname === '/' && !isMenuOpen },
    { id: 'Menu', label: '메뉴', icon: Menu, onClick: () => setIsMenuOpen(true), active: isMenuOpen },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-[5000] bg-[#121212] border-t border-[#333] px-2 py-1 md:hidden safe-bottom shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
        <div className="flex justify-around items-center min-h-[56px] h-auto">
          {bottomNavItems.map((item) => (
            <button
              key={item.id}
              onClick={item.onClick}
              className={`flex flex-col items-center justify-center w-full gap-1 transition-all duration-200 ${
                item.active ? 'text-[#F2A900] scale-110' : 'text-[#888]'
              }`}
            >
              <item.icon size={20} strokeWidth={item.active ? 2.5 : 2} />
              <span className={`text-[10px] font-bold ${item.active ? 'opacity-100' : 'opacity-70'}`}>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
      <GlobalMobileMenu isOpen={isMenuOpen} setIsOpen={setIsMenuOpen} activeMapId={activeTab} />
    </>
  );
}
