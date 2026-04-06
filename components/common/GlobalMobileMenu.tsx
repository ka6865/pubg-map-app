'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, User, LogOut, Sword, Package } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { supabase } from '@/lib/supabase';

interface GlobalMobileMenuProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  activeMapId: string;
}

export default function GlobalMobileMenu({ isOpen, setIsOpen, activeMapId }: GlobalMobileMenuProps) {
  const router = useRouter();
  const { user } = useAuth();
  
  // localStorage를 구독하여 하이드레이션 오류 없이 닉네임 관리
  const displayName = React.useSyncExternalStore(
    (callback) => {
      window.addEventListener('storage', callback);
      return () => window.removeEventListener('storage', callback);
    },
    () => localStorage.getItem('user_nickname') || '',
    () => ''
  );

  useEffect(() => {
    if (user) {
      // Supabase 비동기 데이터 최신화
      supabase.from('profiles').select('nickname').eq('id', user.id).single().then(({data}) => {
        if (data && data.nickname && data.nickname !== displayName) {
          localStorage.setItem('user_nickname', data.nickname);
          // storage 이벤트는 다른 창에서만 발생하므로 수동으로 상태 업데이트가 필요할 수 있음
          // 여기서는 localStorage에 저장하고 UI는 다음 렌더링 때 반영되도록 함
          window.dispatchEvent(new Event('storage'));
        }
      });
    } else if (displayName !== '') {
      localStorage.removeItem('user_nickname');
      window.dispatchEvent(new Event('storage'));
    }
  }, [user, displayName]);

  // Handle body scroll lock when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/60 z-[5000] md:hidden transition-opacity"
        onClick={() => setIsOpen(false)}
      />
      
      <div 
        className="fixed bottom-0 left-0 right-0 z-[5001] bg-[#121212] border-t border-[#333] rounded-t-3xl md:hidden flex flex-col max-h-[90vh] transition-transform animate-in slide-in-from-bottom duration-300 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center justify-between p-5 border-b border-[#222]">
          <div className="w-12 h-1.5 bg-[#333] rounded-full absolute top-2 left-1/2 -translate-x-1/2" />
          <h2 className="text-[#F2A900] font-black text-xl italic tracking-tighter uppercase">
            BGMS Menu
          </h2>
          <button onClick={() => setIsOpen(false)} className="p-1 bg-[#222] rounded-full text-[#666]">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-10 pt-4">
          <div className="flex flex-col gap-6">
            {/* Profile Card */}
            <div className="bg-[#1a1a1a] p-5 rounded-2xl border border-[#333] flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-[#252525] rounded-full flex items-center justify-center border-2 border-[#F2A900]/30">
                  <User size={30} className="text-[#F2A900]" />
                </div>
                <div className="flex flex-col">
                  <span className="text-white font-black text-lg">{user ? (displayName || "게이머") : "익명 사용자"}</span>
                  <span className="text-[#666] text-xs">BGMS에 오신 것을 환영합니다</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => { router.push(user ? '/?tab=Board&mode=mypage' : '/login'); setIsOpen(false); }}
                  className="flex-1 bg-[#F2A900] text-black py-2.5 rounded-xl font-bold text-sm shadow-lg active:scale-95 transition-transform"
                >
                  {user ? "마이페이지" : "로그인하기"}
                </button>
                {user && (
                  <button 
                    onClick={handleLogout}
                    className="px-4 bg-[#222] text-[#888] py-2.5 rounded-xl font-bold text-sm border border-[#333] flex items-center justify-center gap-2"
                  >
                    <LogOut size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Map Selection Section */}
            <div className="flex flex-col gap-3">
              <h3 className="text-[#666] text-[11px] font-black uppercase tracking-widest ml-1">Map Selection</h3>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "Erangel", label: "에란겔" },
                  { id: "Miramar", label: "미라마" },
                  { id: "Taego", label: "태이고" },
                  { id: "Rondo", label: "론도" },
                  { id: "Vikendi", label: "비켄디" },
                  { id: "Deston", label: "데스턴" },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { router.push(`/?tab=${m.id}`); setIsOpen(false); }}
                    className={`text-[13px] font-bold py-3 rounded-xl border active:scale-95 transition-all ${
                      activeMapId === m.id 
                        ? 'bg-[#F2A900] text-black border-[#F2A900] shadow-md' 
                        : 'bg-[#1a1a1a] text-white border-[#333]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tools Section */}
            <div className="flex flex-col gap-3">
              <h3 className="text-[#666] text-[11px] font-black uppercase tracking-widest ml-1">Tactical Tools</h3>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => { router.push('/weapons'); setIsOpen(false); }}
                  className="bg-[#1a1a1a] p-4 rounded-2xl border border-[#333] flex flex-col gap-2 items-start active:bg-[#222] transition-colors"
                >
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                      <Sword size={24} className="text-blue-500" />
                  </div>
                  <div className="flex flex-col items-start">
                      <span className="text-white font-bold text-sm">무기 도감</span>
                      <span className="text-[#666] text-[10px]">데미지 및 스탯 비교</span>
                  </div>
                </button>

                <button 
                  onClick={() => { router.push('/backpack'); setIsOpen(false); }}
                  className="bg-[#1a1a1a] p-4 rounded-2xl border border-[#333] flex flex-col gap-2 items-start active:bg-[#222] transition-colors"
                >
                  <div className="p-2 bg-green-500/10 rounded-lg">
                      <Package size={24} className="text-green-500" />
                  </div>
                  <div className="flex flex-col items-start">
                      <span className="text-white font-bold text-sm">가방 시뮬</span>
                      <span className="text-[#666] text-[10px]">아이템 무게 계산</span>
                  </div>
                </button>

              </div>
            </div>

            {/* Community & Support Section */}
            <div className="flex flex-col gap-3">
              <h3 className="text-[#666] text-[11px] font-black uppercase tracking-widest ml-1">Community & Support</h3>
              <div className="grid grid-cols-2 gap-3">
                <a 
                  href="https://discord.gg/T97MR78awb"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#1a1a1a] p-4 rounded-2xl border border-[#333] flex flex-col gap-2 items-start active:bg-[#222] transition-colors"
                >
                  <div className="p-2 bg-[#5865F2]/10 rounded-lg">
                    {/* Discord SVG Logo */}
                    <svg
                      viewBox="0 0 24 24"
                      width="24"
                      height="24"
                      fill="#5865F2"
                    >
                      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
                    </svg>
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-white font-bold text-sm">Discord</span>
                    <span className="text-[#666] text-[10px]">공식 서버 참여하기</span>
                  </div>
                </a>

                {/* 개발자 후원 (구상 중 - 비활성화) 
                <button 
                  disabled
                  className="bg-[#1a1a1a] p-4 rounded-2xl border border-[#333] flex flex-col gap-2 items-start opacity-50 relative overflow-hidden"
                >
                  <div className="p-2 bg-[#F2A900]/10 rounded-lg">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#F2A900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                    </svg>
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-white font-bold text-sm">개발자 후원</span>
                    <span className="text-[#F2A900] text-[10px] font-black uppercase">준비 중</span>
                  </div>
                </button>
                */}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>

  );
}
