'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Map, BarChart2, MessageSquare, Menu } from 'lucide-react';
import GlobalMobileMenu from './GlobalMobileMenu';

export default function BottomNav() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeTab = searchParams?.get('tab') || 'Erangel';
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Close menu automatically on route change (e.g., when navigating to /weapons)
  useEffect(() => {
    if (isMenuOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsMenuOpen(false);
    }
  }, [pathname, searchParams, isMenuOpen]);

  const bottomNavItems = [
    { id: 'Home', label: '지도', icon: Map, onClick: () => router.push('/?tab=Erangel'), active: ['Erangel', 'Miramar', 'Taego', 'Rondo', 'Vikendi', 'Deston'].includes(activeTab) && pathname === '/' && !isMenuOpen },
    { id: 'Stats', label: '전적', icon: BarChart2, onClick: () => router.push('/?tab=Stats'), active: activeTab === 'Stats' && pathname === '/' && !isMenuOpen },
    { id: 'Board', label: '커뮤니티', icon: MessageSquare, onClick: () => router.push('/?tab=Board'), active: activeTab === 'Board' && pathname === '/' && !isMenuOpen },
    { id: 'Menu', label: '메뉴', icon: Menu, onClick: () => setIsMenuOpen(true), active: isMenuOpen },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-[5000] bg-[#121212] border-t border-[#333] px-2 py-1 md:hidden safe-area-bottom">
        <div className="flex justify-around items-center h-14">
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
