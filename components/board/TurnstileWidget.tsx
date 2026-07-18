"use client";

import { useEffect, useRef, useCallback } from "react";
import type { TurnstileAction } from "@/lib/board/turnstileContract";

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
  action: TurnstileAction;
  callback: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  theme?: "light" | "dark" | "auto";
  language?: string;
  size?: "normal" | "compact";
}

interface TurnstileWidgetProps {
  action: TurnstileAction;
  onVerify: (token: string) => void;
  onError?: () => void;
}

export default function TurnstileWidget({ action, onVerify, onError }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onVerifyRef.current = onVerify;
  }, [onVerify]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const resetCurrentWidget = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, []);

  const handleExpired = useCallback(() => {
    onErrorRef.current?.();
    resetCurrentWidget();
  }, [resetCurrentWidget]);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile) return;
    const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
    if (!sitekey) {
      onErrorRef.current?.();
      return;
    }
    if (widgetIdRef.current) {
      window.turnstile.remove(widgetIdRef.current);
    }
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey,
      action,
      callback: (token) => onVerifyRef.current(token),
      "error-callback": () => onErrorRef.current?.(),
      "expired-callback": handleExpired,
      theme: "dark",
      language: "ko",
    });
  }, [action, handleExpired]);

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
