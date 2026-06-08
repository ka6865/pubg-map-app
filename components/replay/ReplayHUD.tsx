import React from "react";
import { ArrowLeft, Users } from "lucide-react";
import { ZoneState } from "@/types/replay3d";

interface ReplayHUDProps {
  currentTimeMs: number;
  maxTimeMs: number;
  aliveCount: number;
  zones: ZoneState[];
  onBack: () => void;
  formatTime: (ms: number) => string;
}

export default function ReplayHUD({
  currentTimeMs,
  aliveCount,
  zones,
  onBack,
  formatTime
}: ReplayHUDProps) {
  return (
    <div className="absolute top-4 left-4 flex flex-col gap-2 z-10 pointer-events-none">
      {/* 뒤로가기 버튼 */}
      <button
        onClick={onBack}
        className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#161b22]/95 backdrop-blur border border-[#ff9f0a]/30 hover:border-[#ff9f0a] text-[#ff9f0a] hover:bg-[#ff9f0a] hover:text-[#0d1117] rounded-lg font-bold text-xs transition-all cursor-pointer shadow-lg w-fit"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>이전으로</span>
      </button>

      {/* 현재 재생 시간 */}
      <div className="bg-[#161b22]/90 backdrop-blur border border-[#30363d] rounded-lg px-3 py-2 flex items-center gap-3">
        <div className="flex flex-col">
          <span className="text-[8px] font-bold text-[#8b949e] uppercase tracking-widest">ELAPSED</span>
          <span className="text-lg font-mono font-bold text-[#ff9f0a] leading-none">{formatTime(currentTimeMs)}</span>
        </div>
        <div className="w-px h-8 bg-[#30363d]" />
        <div className="flex flex-col">
          <span className="text-[8px] font-bold text-[#8b949e] uppercase tracking-widest">ALIVE</span>
          <div className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-[#2ea043]" />
            <span className="text-lg font-mono font-bold text-[#2ea043] leading-none">{aliveCount}</span>
          </div>
        </div>
      </div>

      {/* 자기장 수축 경고 배지 */}
      {zones.length > 0 && (() => {
        const z1 = zones.findLast(z => z.t <= currentTimeMs) ?? zones[0];
        const z2 = zones.find(z => z.t > currentTimeMs);
        const shrinking = z2 && z2.blueRadius < z1.blueRadius;
        return shrinking ? (
          <div className="bg-[#ff3300]/20 border border-[#ff3300]/60 text-[#ff6633] px-3 py-1.5 rounded-lg text-[10px] font-bold animate-pulse">
            ⚡ 자기장 수축 중
          </div>
        ) : null;
      })()}
    </div>
  );
}
