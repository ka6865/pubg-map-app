"use client";

import React, { useId } from "react";

export type AdminAgentMascotState = "idle" | "thinking" | "speaking" | "approval" | "alert";
export type AdminAgentMascotSize = "sm" | "md" | "floating";

interface AdminAgentMascotProps {
  state: AdminAgentMascotState;
  size: AdminAgentMascotSize;
  bubbleText?: string;
  approvalCount?: number;
  onClick?: () => void;
  ariaControls?: string;
  ariaExpanded?: boolean;
  className?: string;
}

const sizeClass: Record<AdminAgentMascotSize, string> = {
  sm: "h-10 w-10",
  md: "h-14 w-14",
  floating: "h-28 w-28 sm:h-32 sm:w-32"
};

const shellClass: Record<AdminAgentMascotSize, string> = {
  sm: "p-0.5",
  md: "p-1",
  floating: "p-2"
};

const stateLabel: Record<AdminAgentMascotState, string> = {
  idle: "대기 중",
  thinking: "확인 중",
  speaking: "응답 중",
  approval: "승인 대기",
  alert: "주의 필요"
};

export default function AdminAgentMascot({
  state,
  size,
  bubbleText,
  approvalCount = 0,
  onClick,
  ariaControls,
  ariaExpanded,
  className = ""
}: AdminAgentMascotProps) {
  const interactive = Boolean(onClick);
  const isFloating = size === "floating";
  const Wrapper = interactive ? "button" : "div";
  const id = useId().replace(/:/g, "");
  const bodyId = `mascotBody-${id}`;
  const helmetId = `mascotHelmet-${id}`;
  const visorId = `mascotVisor-${id}`;
  const glowId = `mascotGlow-${id}`;

  return (
    <div className={`admin-agent-mascot-root relative inline-flex shrink-0 items-center justify-center ${className}`}>
      {bubbleText && (
        <div className={`pointer-events-none absolute z-10 max-w-[220px] rounded-2xl border border-zinc-700/80 bg-zinc-950/95 px-3.5 py-2.5 text-left text-xs font-semibold leading-relaxed text-zinc-100 shadow-xl shadow-black/40 backdrop-blur-md ${
          isFloating
            ? "bottom-[calc(100%-0.35rem)] right-2"
            : "bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap"
        }`}>
          {bubbleText}
          <span className={`absolute h-3 w-3 rotate-45 border-b border-r border-zinc-700/80 bg-zinc-950/95 ${
            isFloating ? "-bottom-1 right-10" : "-bottom-1 left-1/2 -translate-x-1/2"
          }`} />
        </div>
      )}

      <Wrapper
        type={interactive ? "button" : undefined}
        onClick={onClick}
        aria-label={interactive ? `BGMS AI 비서 열기, ${stateLabel[state]}` : `BGMS AI 비서 ${stateLabel[state]}`}
        aria-controls={interactive ? ariaControls : undefined}
        aria-expanded={interactive && typeof ariaExpanded === "boolean" ? ariaExpanded : undefined}
        className={`admin-agent-mascot admin-agent-mascot-${state} ${sizeClass[size]} ${shellClass[size]} relative flex shrink-0 items-center justify-center rounded-[28%] border border-amber-400/35 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black shadow-xl shadow-amber-950/30 outline-none transition-transform ${
          interactive ? "cursor-pointer hover:scale-110 focus-visible:ring-2 focus-visible:ring-amber-400 active:scale-95" : ""
        }`}
      >
        <svg viewBox="0 0 128 128" role="img" aria-hidden="true" className="h-full w-full overflow-visible">
          <defs>
            <radialGradient id={bodyId} cx="45%" cy="38%" r="65%">
              <stop offset="0%" stopColor="#ffe58f" />
              <stop offset="55%" stopColor="#f2b632" />
              <stop offset="100%" stopColor="#b96f12" />
            </radialGradient>
            <linearGradient id={helmetId} x1="24" x2="104" y1="12" y2="70">
              <stop offset="0%" stopColor="#3f4a5e" />
              <stop offset="48%" stopColor="#1d2738" />
              <stop offset="100%" stopColor="#0b1020" />
            </linearGradient>
            <linearGradient id={visorId} x1="35" x2="93" y1="52" y2="64">
              <stop offset="0%" stopColor="#7dd3fc" />
              <stop offset="50%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
            <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.2 0 0 0 0 0.55 0 0 0 0 1 0 0 0 0.65 0" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <ellipse cx="64" cy="112" rx="31" ry="8" fill="#000" opacity="0.28" className="mascot-shadow" />

          <g className="mascot-wings">
            <path d="M34 73 C18 76 13 91 23 101 C35 98 40 89 42 78 Z" fill="#e89521" stroke="#8c4f0a" strokeWidth="3" />
            <path d="M94 73 C110 76 115 91 105 101 C93 98 88 89 86 78 Z" fill="#e89521" stroke="#8c4f0a" strokeWidth="3" />
          </g>

          <g className="mascot-body">
            <path d="M31 66 C31 43 45 27 64 27 C83 27 97 43 97 66 C97 96 84 112 64 112 C44 112 31 96 31 66 Z" fill={`url(#${bodyId})`} stroke="#6f3f08" strokeWidth="3" />
            <circle cx="44" cy="77" r="4.5" fill="#fb7185" opacity="0.18" className="mascot-cheek mascot-cheek-left" />
            <circle cx="84" cy="77" r="4.5" fill="#fb7185" opacity="0.18" className="mascot-cheek mascot-cheek-right" />
            <path d="M50 100 C57 105 72 105 78 100" fill="none" stroke="#8c4f0a" strokeWidth="4" strokeLinecap="round" opacity="0.45" />
            <path d="M57 83 L71 83 L65 91 Z" fill="#f97316" stroke="#9a3412" strokeWidth="2" strokeLinejoin="round" className="mascot-beak" />
            <path d="M55 112 L48 121" stroke="#d97706" strokeWidth="4" strokeLinecap="round" />
            <path d="M73 112 L80 121" stroke="#d97706" strokeWidth="4" strokeLinecap="round" />
          </g>

          <g className="mascot-helmet">
            <path d="M27 51 C29 25 44 11 66 12 C91 13 105 29 103 54 C91 47 77 44 64 44 C50 44 39 47 27 51 Z" fill={`url(#${helmetId})`} stroke="#020617" strokeWidth="4" />
            <path d="M36 32 C46 19 66 15 84 23" fill="none" stroke="#64748b" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
            <path d="M26 50 C19 50 16 57 18 64 C21 70 29 67 32 62" fill="#1f2937" stroke="#020617" strokeWidth="3" />
            <path d="M102 50 C109 50 112 57 110 64 C107 70 99 67 96 62" fill="#1f2937" stroke="#020617" strokeWidth="3" />
            <path d="M39 49 C44 43 84 43 90 49 C94 54 93 66 88 71 C80 78 48 78 40 71 C35 66 35 54 39 49 Z" fill={`url(#${visorId})`} stroke="#020617" strokeWidth="4" filter={`url(#${glowId})`} className="mascot-visor" />
            <path d="M47 52 C55 49 74 49 84 52" fill="none" stroke="#bfdbfe" strokeWidth="3" strokeLinecap="round" opacity="0.32" className="mascot-visor-shine" />
            <path d="M49 59 C53 63 58 63 61 59" fill="none" stroke="#a7f3d0" strokeWidth="3" strokeLinecap="round" className="mascot-eye mascot-eye-left" />
            <path d="M68 59 C72 63 77 63 80 59" fill="none" stroke="#a7f3d0" strokeWidth="3" strokeLinecap="round" className="mascot-eye mascot-eye-right" />
            <path d="M51 70 C58 73 72 73 79 70" fill="none" stroke="#bfdbfe" strokeWidth="3" strokeLinecap="round" className="mascot-mouth" />
            <path d="M62 13 L62 5" stroke="#64748b" strokeWidth="4" strokeLinecap="round" />
            <circle cx="62" cy="4" r="4" fill="#fbbf24" className="mascot-antenna" />
            <path d="M86 27 L92 33 L103 19" fill="none" stroke="#34d399" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" className="mascot-approval-mark" />
            <g className="mascot-alert-mark">
              <path d="M94 17 L94 30" stroke="#fbbf24" strokeWidth="5" strokeLinecap="round" />
              <circle cx="94" cy="39" r="3.2" fill="#fbbf24" />
            </g>
          </g>

          <g className="mascot-spark">
            <circle cx="101" cy="22" r="3" fill="#fbbf24" />
            <circle cx="26" cy="29" r="2" fill="#60a5fa" />
          </g>
        </svg>

        {approvalCount > 0 && (
          <span className="mascot-approval-badge absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-zinc-950 bg-emerald-400 px-1 text-[10px] font-black text-zinc-950">
            {approvalCount > 9 ? "9+" : approvalCount}
          </span>
        )}
        {state === "alert" && approvalCount === 0 && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border border-zinc-950 bg-amber-400 shadow-lg shadow-amber-400/40" />
        )}
      </Wrapper>

      <style jsx>{`
        .admin-agent-mascot {
          animation: mascot-float 3.2s ease-in-out infinite;
          transform-origin: 50% 84%;
          will-change: transform;
        }
        .admin-agent-mascot-idle .mascot-body {
          animation: mascot-breathe 2.8s ease-in-out infinite;
          transform-origin: 64px 82px;
        }
        .admin-agent-mascot-idle .mascot-wings {
          animation: mascot-idle-wing 3.6s ease-in-out infinite;
          transform-origin: 64px 82px;
        }
        .admin-agent-mascot-idle .mascot-cheek {
          animation: mascot-cheek-soft 3.4s ease-in-out infinite;
        }
        .admin-agent-mascot-thinking .mascot-visor,
        .admin-agent-mascot-thinking .mascot-visor-shine,
        .admin-agent-mascot-thinking .mascot-antenna,
        .admin-agent-mascot-alert .mascot-visor,
        .admin-agent-mascot-alert .mascot-visor-shine,
        .admin-agent-mascot-alert .mascot-antenna {
          animation: mascot-pulse 0.8s ease-in-out infinite;
        }
        .admin-agent-mascot-thinking {
          animation: mascot-think 1.35s ease-in-out infinite;
        }
        .admin-agent-mascot-thinking .mascot-helmet {
          animation: mascot-nod 1.35s ease-in-out infinite;
          transform-origin: 64px 48px;
        }
        .admin-agent-mascot-speaking .mascot-mouth {
          animation: mascot-talk 0.32s ease-in-out infinite;
        }
        .admin-agent-mascot-speaking .mascot-beak {
          animation: mascot-beak-talk 0.32s ease-in-out infinite;
          transform-origin: 64px 85px;
        }
        .admin-agent-mascot-speaking {
          animation: mascot-speak-bob 0.9s ease-in-out infinite;
        }
        .admin-agent-mascot-approval {
          box-shadow: 0 0 0 1px rgba(52, 211, 153, 0.32), 0 18px 45px rgba(4, 120, 87, 0.38);
          animation: mascot-approval-hop 1.55s ease-in-out infinite;
        }
        .admin-agent-mascot-approval .mascot-eye {
          animation: mascot-approval-eye 2.2s ease-in-out infinite;
        }
        .admin-agent-mascot-approval .mascot-approval-mark {
          animation: mascot-mark-pop 1.4s ease-in-out infinite;
          opacity: 1;
        }
        .admin-agent-mascot-approval .mascot-cheek {
          opacity: 0.34;
        }
        .admin-agent-mascot-approval .mascot-approval-badge {
          animation: mascot-badge-pop 1.1s ease-in-out infinite;
        }
        .admin-agent-mascot-alert {
          animation: mascot-float 3.2s ease-in-out infinite, mascot-alert 1.35s ease-in-out infinite;
        }
        .admin-agent-mascot-alert .mascot-alert-mark {
          animation: mascot-alert-mark 0.95s ease-in-out infinite;
          opacity: 1;
        }
        .admin-agent-mascot-alert .mascot-eye {
          animation: mascot-alert-eye 1.6s ease-in-out infinite;
        }
        .mascot-eye {
          transform-origin: center;
          animation: mascot-blink 4.2s ease-in-out infinite;
        }
        .mascot-approval-mark,
        .mascot-alert-mark {
          opacity: 0;
          transform-origin: 94px 28px;
        }
        .mascot-wings {
          transform-origin: 64px 82px;
        }
        .admin-agent-mascot-speaking .mascot-wings,
        .admin-agent-mascot-thinking .mascot-wings {
          animation: mascot-wing 0.8s ease-in-out infinite;
        }
        .admin-agent-mascot-thinking .mascot-spark,
        .admin-agent-mascot-approval .mascot-spark {
          animation: mascot-sparkle 0.9s ease-in-out infinite;
        }
        @keyframes mascot-float {
          0%, 100% { transform: translateY(0) rotate(-1deg); }
          50% { transform: translateY(-12px) rotate(1.5deg); }
        }
        @keyframes mascot-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.035); }
        }
        @keyframes mascot-idle-wing {
          0%, 70%, 100% { transform: rotate(0deg); }
          78% { transform: rotate(-7deg); }
          86% { transform: rotate(5deg); }
          94% { transform: rotate(-3deg); }
        }
        @keyframes mascot-cheek-soft {
          0%, 100% { opacity: 0.16; }
          50% { opacity: 0.3; }
        }
        @keyframes mascot-blink {
          0%, 84%, 100% { transform: scaleY(1); }
          88% { transform: scaleY(0.08); }
          92% { transform: scaleY(1); }
          95% { transform: scaleY(0.08); }
        }
        @keyframes mascot-talk {
          0%, 100% { transform: translateY(0) scaleX(1); opacity: 1; }
          50% { transform: translateY(3px) scaleX(0.62); opacity: 0.65; }
        }
        @keyframes mascot-beak-talk {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.35) translateY(1px); }
        }
        @keyframes mascot-pulse {
          0%, 100% { opacity: 1; filter: drop-shadow(0 0 0 rgba(96, 165, 250, 0)); }
          50% { opacity: 0.56; filter: drop-shadow(0 0 10px rgba(96, 165, 250, 0.95)); }
        }
        @keyframes mascot-think {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-8px) rotate(2deg); }
        }
        @keyframes mascot-nod {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(3px); }
        }
        @keyframes mascot-speak-bob {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-6px) scale(1.025); }
        }
        @keyframes mascot-wing {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-9deg); }
        }
        @keyframes mascot-sparkle {
          0%, 100% { opacity: 0.35; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.12); }
        }
        @keyframes mascot-approval-eye {
          0%, 100% { transform: translateY(0) scaleY(1); }
          45% { transform: translateY(-1px) scaleY(0.75); }
          70% { transform: translateY(0) scaleY(1); }
        }
        @keyframes mascot-approval-hop {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          35% { transform: translateY(-10px) rotate(-3deg); }
          70% { transform: translateY(-3px) rotate(2deg); }
        }
        @keyframes mascot-mark-pop {
          0%, 100% { transform: scale(0.92); opacity: 0.72; }
          50% { transform: scale(1.08); opacity: 1; }
        }
        @keyframes mascot-badge-pop {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.16); }
        }
        @keyframes mascot-alert {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.2), 0 18px 45px rgba(120, 53, 15, 0.24); }
          50% { box-shadow: 0 0 0 12px rgba(251, 191, 36, 0.08), 0 18px 45px rgba(120, 53, 15, 0.42); }
        }
        @keyframes mascot-alert-mark {
          0%, 100% { transform: translateY(0) scale(0.95); opacity: 0.72; }
          50% { transform: translateY(-2px) scale(1.08); opacity: 1; }
        }
        @keyframes mascot-alert-eye {
          0%, 100% { transform: translateX(0); }
          45% { transform: translateX(-1.5px); }
          70% { transform: translateX(1.5px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .admin-agent-mascot,
          .admin-agent-mascot-alert,
          .admin-agent-mascot-thinking .mascot-visor,
          .admin-agent-mascot-thinking .mascot-visor-shine,
          .admin-agent-mascot-thinking .mascot-antenna,
          .admin-agent-mascot-alert .mascot-visor,
          .admin-agent-mascot-alert .mascot-visor-shine,
          .admin-agent-mascot-alert .mascot-antenna,
          .admin-agent-mascot-speaking .mascot-mouth,
          .admin-agent-mascot-speaking .mascot-beak,
          .admin-agent-mascot-idle .mascot-cheek,
          .admin-agent-mascot-approval .mascot-eye,
          .admin-agent-mascot-approval .mascot-approval-mark,
          .admin-agent-mascot-alert .mascot-alert-mark,
          .admin-agent-mascot-alert .mascot-eye,
          .mascot-eye,
          .admin-agent-mascot-speaking .mascot-wings,
          .admin-agent-mascot-thinking .mascot-wings,
          .admin-agent-mascot-thinking .mascot-spark,
          .admin-agent-mascot-approval .mascot-spark {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
