'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';

export default function HomeNotice() {
  const [latestNotice, setLatestNotice] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const fetchLatestNotice = async () => {
      try {
        // 시스템 설정 가져오기
        const settingsRes = await fetch('/api/admin/settings');
        let activeId: string | null = null;
        let displayDays = 7; // 기본 노출 기한 7일

        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          if (settingsData.success && settingsData.settings) {
            activeId = settingsData.settings.notice_active_id || null;
            displayDays = settingsData.settings.notice_display_days !== undefined
              ? parseInt(settingsData.settings.notice_display_days, 10)
              : 7;
          }
        }

        // 공지 비활성화 조건 처리 ('none' 또는 '-1' 인 경우 공지 비노출)
        if (activeId === 'none' || activeId === '-1') {
          setIsVisible(false);
          setIsLoading(false);
          return;
        }

        let data = null;
        let error = null;

        // 특정 공지글 ID가 지정되어 있다면 해당 공지 조회
        if (activeId) {
          const activeIdNum = parseInt(activeId, 10);
          if (!isNaN(activeIdNum)) {
            const result = await supabase
              .from('posts')
              .select('id, title, category, created_at')
              .eq('id', activeIdNum)
              .maybeSingle();
            data = result.data;
            error = result.error;
          }
        }

        // 지정된 공지가 없거나 에러인 경우 fallback으로 최신 공지글 1건 조회
        if (!data || error) {
          const result = await supabase
            .from('posts')
            .select('id, title, category, created_at')
            .eq('is_notice', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          data = result.data;
          error = result.error;
        }

        if (!error && data) {
          const createdAtTime = new Date(data.created_at).getTime();
          const currentTime = new Date().getTime();

          // displayDays가 0이면 무제한 노출, 0보다 크면 기한 만료 여부 판별
          if (displayDays > 0 && (currentTime - createdAtTime > displayDays * 24 * 60 * 60 * 1000)) {
            setIsVisible(false);
          } else {
            // localStorage에서 숨김 처리된 ID 확인
            const dismissedNoticeId = localStorage.getItem('dismissed_notice_id');
            if (dismissedNoticeId === data.id.toString()) {
              setIsVisible(false);
            } else {
              setIsVisible(true);
            }
          }
          setLatestNotice(data);
        } else {
          setIsVisible(false);
        }
      } catch (err) {
        console.error('공지사항 조회 중 오류 발생:', err);
        setIsVisible(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLatestNotice();

    // 실시간 데이터 구독 (새 공지 등록 시 즉각 반영)
    const channel = supabase
      .channel('public:posts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => {
        fetchLatestNotice();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (isLoading || !latestNotice || !isVisible || searchParams?.get("notice") === "false") return null;

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
