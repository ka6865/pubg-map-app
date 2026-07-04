'use client';

import { useEffect, useRef } from 'react';

interface AdSenseBannerProps {
  client: string;
  slot: string;
  className?: string;
}

/**
 * 구글 애드센스 배너 광고 컴포넌트
 * - 개발 환경(localhost)에서는 광고 자리를 시각적 플레이스홀더로 표시합니다.
 * - 프로덕션 환경에서는 실제 ins 태그로 구글 애드센스 광고를 노출합니다.
 * - SPA 전환 시에도 ins 태그를 재마운트하여 광고를 재초기화합니다.
 */
export default function AdSenseBanner({ client, slot, className }: AdSenseBannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDev = process.env.NODE_ENV === 'development';

  useEffect(() => {
    if (isDev) return; // 개발 환경에서는 placeholder만 사용

    const container = containerRef.current;
    if (!container) return;

    // 기존 태그 제거 후 ins와 script 쌍으로 재마운트 (SPA 동적 로드 완벽 보장)
    container.innerHTML = '';

    // 1. 애드센스 메인 스크립트 로드 확인 및 추가 (없을 때만)
    const scriptId = 'adsbygoogle-main-js';
    let mainScript = document.getElementById(scriptId) as HTMLScriptElement;
    if (!mainScript) {
      mainScript = document.createElement('script');
      mainScript.id = scriptId;
      mainScript.async = true;
      mainScript.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
      mainScript.crossOrigin = 'anonymous';
      document.head.appendChild(mainScript);
    }

    // 2. ins 태그 생성
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', client);
    ins.setAttribute('data-ad-slot', slot);
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');

    // 3. 광고 실행용 스크립트 생성
    const pushScript = document.createElement('script');
    pushScript.innerHTML = '(window.adsbygoogle = window.adsbygoogle || []).push({});';

    container.appendChild(ins);
    container.appendChild(pushScript);
  }, [client, slot, isDev]);

  // 개발 환경: 광고 위치 시각적 플레이스홀더 (Google Blue 테마 적용)
  if (isDev) {
    return (
      <div
        className={className}
        style={{
          width: '160px',
          height: '600px',
          maxWidth: '100%',
          margin: '0 auto',
          border: '2px dashed rgba(66, 133, 244, 0.4)',
          borderRadius: 8,
          backgroundColor: 'rgba(66, 133, 244, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          boxSizing: 'border-box',
          padding: '16px',
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(66, 133, 244, 0.8)', letterSpacing: '0.05em' }}>
          GOOGLE ADSENSE
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.3)' }}>
          160 × 600
        </span>
        <span style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.15)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
          Slot: {slot}
        </span>
      </div>
    );
  }

  // 프로덕션 환경: 실제 광고 컨테이너
  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '160px', maxWidth: '100%', margin: '0 auto' }}
      aria-label="구글 애드센스 광고"
    />
  );
}
