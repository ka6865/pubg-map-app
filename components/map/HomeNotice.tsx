'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';

export default function HomeNotice() {
  const [latestNotice, setLatestNotice] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchLatestNotice = async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('id, title, category, created_at')
        .eq('is_notice', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!error && data) {
        // localStorage에서 숨김 처리된 ID 확인
        const dismissedNoticeId = localStorage.getItem('dismissed_notice_id');
        if (dismissedNoticeId === data.id.toString()) {
          setIsVisible(false);
        }
        setLatestNotice(data);
      }
      setIsLoading(false);
    };

    fetchLatestNotice();
    
    // 🌟 실시간 데이터 구독 (새 공지 등록 시 즉각 반영)
    const channel = supabase
      .channel('public:posts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
        if (payload.new.is_notice) {
          setLatestNotice(payload.new);
          setIsVisible(true); // 새 공지가 오면 다시 표시
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (isLoading || !latestNotice || !isVisible) return null;

  const handleNoticeClick = () => {
    router.push(`/board/${latestNotice.id}`);
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation(); // 부모 클릭 이벤트(이동) 방지
    if (latestNotice) {
      localStorage.setItem('dismissed_notice_id', latestNotice.id.toString());
      setIsVisible(false);
    }
  };

  return (
    <div 
      className="absolute top-0 left-0 right-0 h-9 bg-black/80 backdrop-blur-md border-b border-[#F2A900]/30 z-[5000] flex items-center px-4 overflow-hidden group cursor-pointer hover:bg-black/90 transition-all"
      onClick={handleNoticeClick}
    >
      <div className="flex items-center gap-3 w-full">
        <div className="flex-shrink-0 bg-[#F2A900] text-black text-[10px] font-black px-2 py-0.5 rounded italic uppercase tracking-tighter shadow-[0_0_10px_#F2A900/50]">
          {latestNotice.category || 'NOTICE'}
        </div>
        
        <div className="flex-1 overflow-hidden">
          <div className="text-white text-xs font-bold whitespace-nowrap overflow-hidden text-ellipsis group-hover:text-[#F2A900] transition-colors">
            {latestNotice.title}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 text-[10px] font-bold text-gray-500 group-hover:text-gray-400 transition-colors uppercase">
            자세히 보기 <span className="ml-0.5 italic">→</span>
          </div>
          
          {/* 구분선 */}
          <div className="w-[1px] h-3 bg-white/10" />
          
          {/* 닫기(더이상 보지 않기) 버튼 */}
          <button 
            onClick={handleDismiss}
            className="flex-shrink-0 text-[10px] font-bold text-gray-500 hover:text-white px-1 py-0.5 rounded transition-colors"
            title="더이상 보지 않기"
          >
            오늘 숨김
          </button>
        </div>
      </div>

      {/* 후광 효과 (애니메이션) */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#F2A900]/5 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite] pointer-events-none" />
      
      <style jsx>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
