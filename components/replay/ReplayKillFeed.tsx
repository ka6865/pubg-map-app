import React from "react";
import { Crosshair, Skull } from "lucide-react";
import { PlayerTrajectory } from "@/types/replay3d";

interface ReplayKillFeedProps {
  activeKillLogs: any[];
  players: PlayerTrajectory[];
}

export default function ReplayKillFeed({ activeKillLogs, players }: ReplayKillFeedProps) {
  if (activeKillLogs.length === 0) return null;

  return (
    <div className="absolute right-3 top-24 flex max-w-[min(20rem,calc(100vw-1.5rem))] flex-col gap-2 z-10 pointer-events-none select-none sm:right-4 sm:top-4 sm:max-w-[320px]">
      {activeKillLogs.map((ev, idx) => {
        const isKill = ev.type === "kill";
        const attackerName = ev.attackerName || ev.attacker || "환경 요인";
        const victimName = ev.victim || "알 수 없음";
        
        // 아군이 관여된 킬로그인지 판별
        const isAttackerTeam = players.find(p => p.name === attackerName)?.isTeam;
        const isVictimTeam = players.find(p => p.name === victimName)?.isTeam;
        const isOurSquadInvolved = isAttackerTeam || isVictimTeam;
        
        return (
          <div
            key={`feed-${ev.relativeTimeMs}-${idx}`}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] sm:text-xs font-semibold backdrop-blur-sm transition-all duration-300 ${
              isOurSquadInvolved
                ? "bg-[#ff9f0a]/15 border-[#ff9f0a]/40 text-[#ff9f0a] shadow-[0_0_8px_rgba(255,159,10,0.1)]"
                : "bg-[#161b22]/85 border-[#30363d] text-[#e6edf3]"
            }`}
          >
            <span className={isAttackerTeam ? "text-[#ff9f0a]" : "text-[#8b949e]"}>
              {attackerName}
            </span>
            <span className="text-[#6e7681] mx-0.5 shrink-0">
              {isKill ? <Skull className="w-3 h-3" /> : <Crosshair className="w-3 h-3" />}
            </span>
            <span className={isVictimTeam ? "text-[#ff9f0a]" : "text-[#ff4a4a]"}>
              {victimName}
            </span>
            {ev.weapon && (
              <span className="hidden sm:inline text-[9px] text-[#8b949e] bg-[#21262d] px-1.5 py-0.5 rounded border border-[#30363d] ml-1">
                {ev.weapon.replace("Weap", "").replace("_C", "")}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
