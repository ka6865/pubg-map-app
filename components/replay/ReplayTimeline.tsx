import React from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { PlayerTrajectory } from "@/types/replay3d";

interface ReplayTimelineProps {
  currentTimeMs: number;
  setCurrentTimeMs: (t: number) => void;
  maxTimeMs: number;
  isPlaying: boolean;
  setIsPlaying: (p: boolean) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (s: number) => void;
  timelineMarkers: any[];
  players: PlayerTrajectory[];
  formatTime: (ms: number) => string;
}

export default function ReplayTimeline({
  currentTimeMs,
  setCurrentTimeMs,
  maxTimeMs,
  isPlaying,
  setIsPlaying,
  playbackSpeed,
  setPlaybackSpeed,
  timelineMarkers,
  players,
  formatTime
}: ReplayTimelineProps) {
  return (
    <div className="absolute bottom-0 left-0 right-0 bg-[#161b22]/96 backdrop-blur-md border-t border-[#30363d] z-10 select-none pb-5 md:pb-0 touch-none">
      
      {/* 킬/기절 이벤트 마커가 있는 타임라인 트랙 */}
      <div
        className="relative w-full h-7 bg-[#0d1117] cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setIsPlaying(false);
          setCurrentTimeMs(((e.clientX - rect.left) / rect.width) * maxTimeMs);
        }}
        onTouchStart={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setIsPlaying(false);
          const touchX = e.touches[0].clientX;
          setCurrentTimeMs(((touchX - rect.left) / rect.width) * maxTimeMs);
        }}
        onTouchMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setIsPlaying(false);
          const touchX = e.touches[0].clientX;
          setCurrentTimeMs(Math.max(0, Math.min(maxTimeMs, ((touchX - rect.left) / rect.width) * maxTimeMs)));
        }}
      >
        {/* 진행 바 */}
        <div
          className="absolute top-0 left-0 h-full bg-[#ff9f0a]/30 pointer-events-none"
          style={{ width: `${maxTimeMs > 0 ? (currentTimeMs / maxTimeMs) * 100 : 0}%` }}
        />
        {/* 현재 위치 커서 */}
        <div
          className="absolute top-0 w-0.5 h-full bg-[#ff9f0a] pointer-events-none z-10"
          style={{ left: `${maxTimeMs > 0 ? (currentTimeMs / maxTimeMs) * 100 : 0}%` }}
        />
        {/* 이벤트 마커 */}
        {timelineMarkers.map((ev, i) => {
          const ratio = maxTimeMs > 0 ? ev.relativeTimeMs / maxTimeMs : 0;
          if (ratio < 0 || ratio > 1) return null;
          const isKill = ev.type === "kill";
          const attackerPlayer = players.find(p => p.name === ev.attackerName || p.name === ev.attacker);
          const markerColor = attackerPlayer ? attackerPlayer.color : (isKill ? "#ef4444" : "#f97316");
          return (
            <div
              key={`marker-${i}`}
              title={`${ev.attackerName || ev.attacker || "?"} → ${ev.victim ?? "?"} (${isKill ? "킬" : "기절"})`}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentTimeMs(ev.relativeTimeMs);
              }}
              className="absolute top-1/2 -translate-y-1/2 cursor-pointer hover:scale-125 transition-transform z-20"
              style={{
                left: `${ratio * 100}%`,
                width: isKill ? "4px" : "3px",
                height: isKill ? "16px" : "10px",
                backgroundColor: markerColor,
                borderRadius: "1px",
                boxShadow: `0 0 4px ${markerColor}`,
              }}
            />
          );
        })}
      </div>

      {/* 컨트롤 바 (모바일 반응형 2-row 최적화) */}
      <div className="px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#161b22]/98">
        {/* 1. 슬라이더 (모바일에선 1열 풀 배치로 넉넉하게 스크러빙) */}
        <div className="w-full md:flex-1 order-1 md:order-2 px-1 md:px-4">
          <input
            type="range"
            min={0}
            max={maxTimeMs}
            value={currentTimeMs}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentTimeMs(Number(e.target.value));
            }}
            className="w-full accent-[#ff9f0a] h-1.5 bg-[#30363d] rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* 2. 조작부 그룹 (모바일에선 2열 하단 가로 분배 배치) */}
        <div className="w-full md:w-auto flex items-center justify-between gap-4 order-2 md:order-1 shrink-0">
          {/* 재생 버튼 & 리셋 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-9 h-9 flex items-center justify-center bg-[#ff9f0a] hover:bg-[#e08b00] active:scale-95 text-[#0d1117] rounded-full transition-all cursor-pointer shadow-lg"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>
            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentTimeMs(0);
              }}
              className="w-8 h-8 flex items-center justify-center bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-full text-[#e6edf3] transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 시간 표시 */}
          <div className="font-mono text-xs md:text-sm font-bold whitespace-nowrap">
            <span className="text-[#ff9f0a]">{formatTime(currentTimeMs)}</span>
            <span className="text-[#484f58] mx-1">/</span>
            <span className="text-[#8b949e]">{formatTime(maxTimeMs)}</span>
          </div>

          {/* 배속 선택 */}
          <select
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
            className="bg-[#21262d] text-[#ff9f0a] text-[11px] font-bold border border-[#30363d] rounded-lg px-2 py-1.5 outline-none cursor-pointer"
          >
            {[1, 2, 4, 8, 16, 32].map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
