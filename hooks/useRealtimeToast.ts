'use client';

/**
 * @fileoverview useRealtimeToast
 * Supabase Realtime을 구독하여 pending_markers 테이블에 새로운 제보(INSERT)가
 * 들어올 때 접속 중인 모든 유저에게 Toast 알림을 띄웁니다.
 */

import { useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

// 영문 map_name → 한국어 표시명 변환 테이블
const MAP_LABEL: Record<string, string> = {
  Erangel:  '에란겔',
  Miramar:  '미라마',
  Taego:    '테이고',
  Rondo:    '론도',
  Vikendi:  '비켄디',
  Deston:   '데스턴',
};

export function useRealtimeToast() {
  useEffect(() => {
    // pending_markers 테이블의 INSERT 이벤트를 전역으로 구독
    const channel = supabase
      .channel('global-report-toast')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pending_markers',
        },
        (payload) => {
          const mapName: string = (payload.new as { map_name?: string }).map_name || '';
          const koreanName = MAP_LABEL[mapName] || mapName;
          const markerType: string = (payload.new as { marker_type?: string }).marker_type || '차량';

          // Sonner Toast — 3초간 우측 상단에 표시
          toast.info(`방금 [${koreanName}]에 새로운 차량 제보가 들어왔습니다!`, {
            description: `제보 차량: ${markerType}`,
            duration: 4000,
            position: 'top-right',
          });
        }
      )
      .subscribe();

    // 컴포넌트 언마운트 시 채널 구독 해제
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
