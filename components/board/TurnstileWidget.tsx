"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * @fileoverview Cloudflare Turnstile 캡차 위젯 컴포넌트
 *
 * 세션 1회 인증 방식으로 동작합니다.
 * onVerify 콜백으로 토큰을 전달하면 부모에서 세션스토리지에 저장하여
 * 이후 동일 탭에서는 캡차 없이 글쓰기/댓글을 허용합니다.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: TurnstileOptions) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

interface TurnstileOptions {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  theme?: "light" | "dark" | "auto";
  language?: string;
  size?: "normal" | "compact";
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onError?: () => void;
}

export default function TurnstileWidget({ onVerify, onError }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile) return;
    if (widgetIdRef.current) {
      window.turnstile.remove(widgetIdRef.current);
    }
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!,
      callback: onVerify,
      "error-callback": onError,
      "expired-callback": () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
      theme: "dark",
      language: "ko",
    });
  }, [onVerify, onError]);

  useEffect(() => {
    // 스크립트가 이미 로드된 경우 바로 렌더링
    if (window.turnstile) {
      renderWidget();
      return;
    }

    // Turnstile 스크립트 동적 로드
    const scriptId = "cf-turnstile-script";
    if (!document.getElementById(scriptId)) {
      window.onTurnstileLoad = renderWidget;
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    } else {
      // 스크립트 태그는 있으나 turnstile 객체 미준비 상태 대기
      const interval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(interval);
          renderWidget();
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [renderWidget]);

  useEffect(() => {
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex justify-center"
      aria-label="보안 인증"
    />
  );
}
