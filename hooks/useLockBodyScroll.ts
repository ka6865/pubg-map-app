import { useEffect } from "react";

// 모달 활성화 시 바디 스크롤을 막아주는 커스텀 훅
export function useLockBodyScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    // 기존 body의 overflow 스타일 값을 기억
    const originalOverflow = document.body.style.overflow;
    
    // 스크롤 막기
    document.body.style.overflow = "hidden";

    // 언마운트 또는 locked 상태 해제 시 원래 스타일로 복원
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [locked]);
}
