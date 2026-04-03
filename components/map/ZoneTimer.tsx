"use client";
import React from "react";

interface ZoneTimerProps {
  zoneEvents: any[];
  currentTimeMs: number;
  showZone: boolean;
}

function formatMs(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function ZoneTimer({ zoneEvents, currentTimeMs, showZone }: ZoneTimerProps) {
  if (!showZone || zoneEvents.length === 0) return null;

  // 현재 시간에 맞는 가장 최근 존 스냅샷
  let latestZone: any = null;
  for (const z of zoneEvents) {
    if (z.relativeTimeMs <= currentTimeMs) {
      latestZone = z;
    } else {
      break;
    }
  }
  if (!latestZone) return null;

  const isMoving: boolean = latestZone.isZoneMoving ?? false;
  const nextPhaseMs: number | null = latestZone.nextPhaseRelativeMs ?? null;
  const remaining = nextPhaseMs != null ? nextPhaseMs - currentTimeMs : null;

  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-[4400] flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold pointer-events-none select-none"
      style={{
        backgroundColor: "rgba(10,10,10,0.82)",
        border: isMoving
          ? "1.5px solid rgba(59,130,246,0.7)"
          : "1.5px solid rgba(255,255,255,0.15)",
        backdropFilter: "blur(6px)",
      }}
    >
      {/* 자기장 이동 여부 인디케이터 */}
      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{
          backgroundColor: isMoving ? "#3b82f6" : "#6b7280",
          boxShadow: isMoving ? "0 0 6px #3b82f6" : "none",
          animation: isMoving ? "pulse 1.2s infinite" : "none",
        }}
      />

      {isMoving ? (
        <span className="text-blue-300">자기장 이동 중</span>
      ) : (
        <span className="text-gray-400">자기장 대기</span>
      )}

      {/* 다음 단계까지 남은 시간 */}
      {remaining != null && remaining > 0 && (
        <>
          <span className="text-white/30">|</span>
          <span className="text-white/80">
            {isMoving ? "다음 구역" : "자기장 이동"} →{" "}
            <span
              style={{
                color: remaining < 30000 ? "#f97316" : remaining < 10000 ? "#ef4444" : "#facc15",
              }}
            >
              {formatMs(remaining)}
            </span>
          </span>
        </>
      )}

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
