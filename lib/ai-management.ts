/**
 * AI 분석 전역 관리 시스템 (V1.0)
 * 목적: 중복 Gemini API 호출 방지 및 페이지 이탈 시 즉시 중단 제어
 */

type AIStatus = {
  isAnalyzing: boolean;
  activeId: string | null; // 현재 분석 중인 매치 ID 또는 'summary'
};

let currentStatus: AIStatus = {
  isAnalyzing: false,
  activeId: null,
};

const listeners = new Set<(status: AIStatus) => void>();

export const aiManager = {
  getStatus: () => currentStatus,
  
  startAnalysis: (id: string) => {
    if (currentStatus.isAnalyzing) return false;
    currentStatus = { isAnalyzing: true, activeId: id };
    notify();
    return true;
  },
  
  stopAnalysis: (id: string) => {
    if (currentStatus.activeId === id) {
      currentStatus = { isAnalyzing: false, activeId: null };
      notify();
    }
  },
  
  subscribe: (listener: (status: AIStatus) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
};

function notify() {
  listeners.forEach(l => l(currentStatus));
}

// React Hook for easy use
import { useState, useEffect } from 'react';

export function useAIStatus() {
  const [status, setStatus] = useState<AIStatus>(aiManager.getStatus());

  useEffect(() => {
    const unsubscribe = aiManager.subscribe(setStatus);
    return () => {
      unsubscribe();
    };
  }, []);

  return status;
}
