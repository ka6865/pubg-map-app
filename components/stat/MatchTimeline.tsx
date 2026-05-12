"use client";

import React from "react";
import { 
  Skull, 
  Target, 
  Heart, 
  Zap, 
  ShieldAlert, 
  Trophy, 
  Briefcase,
  Crosshair,
  ArrowRight,
  Clock,
  Swords
} from "lucide-react";
import { TimelineEvent } from "../../lib/pubg-analysis/types";

interface MatchTimelineProps {
  events: TimelineEvent[];
}

const formatTime = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const getEventLabel = (type: TimelineEvent['type']) => {
  switch (type) {
    case 'KILL': return { text: "킬 달성", color: "bg-red-500", textColor: "text-white" };
    case 'KNOCK': return { text: "적 기절", color: "bg-orange-500", textColor: "text-white" };
    case 'FINISH': return { text: "확킬", color: "bg-indigo-500", textColor: "text-white" };
    case 'REVIVE': return { text: "아군 부활", color: "bg-emerald-500", textColor: "text-white" };
    case 'DIED': return { text: "최종 사망", color: "bg-gray-700", textColor: "text-gray-200" };
    case 'DOWNED': return { text: "나 기절", color: "bg-amber-600", textColor: "text-white" };
    case 'TEAM_KNOCK': return { text: "팀원 기절", color: "bg-orange-500/80", textColor: "text-white" };
    case 'TEAM_KILL': return { text: "팀원 킬", color: "bg-red-500/80", textColor: "text-white" };
    case 'TEAM_REVIVE': return { text: "팀원 부활", color: "bg-emerald-500/80", textColor: "text-white" };
    case 'TEAM_DIED': return { text: "팀원 사망", color: "bg-red-900/80", textColor: "text-red-100" };
    case 'ITEM_USE': return { text: "아이템 사용", color: "bg-blue-600", textColor: "text-white" };
    case 'RECALL': return { text: "블루칩 부활", color: "bg-indigo-600", textColor: "text-white" };
    default: return { text: "기타", color: "bg-gray-500", textColor: "text-white" };
  }
};

export const MatchTimeline = ({ events }: MatchTimelineProps) => {
  // 회복/부스트 아이템 제외 및 빈 이름 유령 로그 필터링
  const filteredEvents = events.filter(e => {
    if (e.type === 'ITEM_USE') {
      const w = (e.weapon || "").trim().toLowerCase();
      // 이름이 없으면 필터링
      if (!w) return false;
      
      // 회복/부스트 키워드 제외
      const healBoostKeywords = [
        "firstaid", "medkit", "bandage", "energydrink", "painkiller", "adrenaline",
        "구급상자", "의료용 키트", "붕대", "에너지 드링크", "진통제", "아드레날린"
      ];
      return !healBoostKeywords.some(k => w.includes(k));
    }
    return true;
  });

  if (!filteredEvents || filteredEvents.length === 0) {
    return (
      <div className="py-20 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-[2rem] bg-white/[0.02]">
        <Clock size={40} className="text-white/10 mb-3 animate-pulse" />
        <span className="text-gray-500 font-black text-lg tracking-tight">기록된 주요 교전이 없습니다.</span>
      </div>
    );
  }

  const groups: { phase: number | string, events: TimelineEvent[] }[] = [];
  let currentGroup: { phase: number | string, events: TimelineEvent[] } = { phase: 0, events: [] };

  filteredEvents.forEach(event => {
    if (event.type === 'PHASE_START') {
      // 이전 그룹에 PHASE_START 외의 실제 이벤트가 있는 경우에만 추가
      if (currentGroup.events.some(e => e.type !== 'PHASE_START')) {
        groups.push(currentGroup);
      }
      currentGroup = { phase: event.phase ?? 'Unknown', events: [event] };
    } else {
      currentGroup.events.push(event);
    }
  });
  // 마지막 그룹도 실제 이벤트가 있는 경우에만 추가
  if (currentGroup.events.some(e => e.type !== 'PHASE_START')) {
    groups.push(currentGroup);
  }

  return (
    <div className="space-y-12 pb-10">
      {groups.map((group, gIdx) => (
        <div key={gIdx} className="relative">
          <div className="sticky top-0 z-20 flex items-center gap-4 py-4 bg-black/90 backdrop-blur-md">
            <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-full">
              <Zap size={14} className="text-blue-400" />
              <span className="text-xs font-black text-blue-400 uppercase tracking-widest">
                Phase {group.phase}
              </span>
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-blue-500/30 to-transparent" />
          </div>

          <div className="pl-4 border-l-2 border-white/5 ml-8 mt-6 space-y-4">
            {group.events.map((event, idx) => {
              if (event.type === 'PHASE_START') return null;

              const isMe = ['KILL', 'KNOCK', 'REVIVE', 'DIED', 'DOWNED', 'VICTORY', 'RECALL'].includes(event.type);
              const labelInfo = getEventLabel(event.type);

              return (
                <div key={idx} className={`relative flex items-center gap-6 group transition-all duration-300 ${isMe ? 'scale-[1.02]' : 'opacity-70 hover:opacity-100'}`}>
                  <div className="absolute -left-[37px] top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-black border-2 border-white/10 flex items-center justify-center group-hover:border-blue-500 transition-colors">
                    <div className={`w-2 h-2 rounded-full ${isMe ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]' : 'bg-white/20'}`} />
                  </div>

                  <div className="w-16 shrink-0">
                    <span className="text-[11px] font-bold text-gray-500 tabular-nums">
                      {formatTime(event.ts)}
                    </span>
                  </div>

                  <div className={`flex-1 flex items-center gap-4 p-3 rounded-xl border bg-white/[0.03] ${isMe ? 'border-white/10' : 'border-white/5'}`}>
                    {/* 텍스트 배지(Badge) 추가 */}
                    <div className={`px-2 py-0.5 rounded-md text-[10px] font-black shrink-0 ${labelInfo.color} ${labelInfo.textColor}`}>
                      {labelInfo.text}
                    </div>

                    <div className="flex-1 flex items-center justify-between overflow-hidden">
                      <div className="flex items-center gap-2 truncate text-sm font-bold tracking-tight">
                        {renderEventText(event)}
                        {event.isHeadshot && (
                          <span className="text-red-500 flex items-center gap-1">
                            <Crosshair size={12} strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      
                      {event.type === 'VICTORY' && <Trophy size={18} className="text-yellow-400 animate-bounce" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

const renderEventText = (event: TimelineEvent) => {
  const weaponStr = event.weapon ? ` (${event.weapon})` : "";
  const isThrowable = ["수류탄", "연막", "화염병", "섬광", "C4"].some(k => event.weapon?.includes(k));
  const distStr = (!isThrowable && event.distance !== undefined) ? ` [${event.distance}m]` : "";

  switch (event.type) {
    case 'FINISH':
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-white">{event.victim}</span>
          <span className="text-[10px] text-gray-500 ml-1">(킬 주인: {event.attacker}{weaponStr})</span>
        </div>
      );
    case 'KILL': 
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-white font-black">{event.victim}</span>
          <span className="text-[10px] text-gray-500 ml-1">({event.weapon}){distStr}</span>
        </div>
      );
    case 'KNOCK':
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-white">{event.victim}</span>
          <span className="text-[10px] text-gray-500 ml-1">({event.weapon}){distStr}</span>
        </div>
      );
    case 'TEAM_KILL':
      return (
        <div className="flex items-center gap-1.5 text-red-400/80">
          <span className="font-bold">{event.attacker}</span>
          <ArrowRight size={10} />
          <span>{event.victim}{weaponStr}</span>
        </div>
      );
    case 'TEAM_KNOCK':
      return (
        <div className="flex items-center gap-1.5 text-orange-400/80">
          <span className="font-bold">{event.attacker}</span>
          <ArrowRight size={10} />
          <span>{event.victim}{weaponStr}</span>
        </div>
      );
    case 'REVIVE':
      return <span className="text-emerald-400">{event.victim}님 부활 완료</span>;
    case 'TEAM_REVIVE':
      return <span className="text-emerald-500/80">{event.attacker} → {event.victim} 부활</span>;
    case 'RECALL':
      return (
        <span className="text-indigo-400 font-bold">
          {event.attacker ? `${event.attacker} → ` : ""}{event.victim} 블루칩 부활
        </span>
      );
    case 'TEAM_DIED':
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-red-400/90 font-bold">{event.victim} 사망</span>
          <span className="text-[10px] text-gray-500 ml-1">({event.attacker}{weaponStr})</span>
        </div>
      );
    case 'DOWNED':
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-red-400 font-medium">{event.attacker}{weaponStr}</span>
          <span className="text-[10px] text-gray-500 ml-1">{distStr}</span>
        </div>
      );
    case 'DIED':
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-red-600 font-black">{event.attacker}{weaponStr}</span>
        </div>
      );
    case 'ITEM_USE':
      return (
        <span className="text-blue-300 font-bold">
          {event.attacker ? `${event.attacker}: ` : ""}{event.weapon}
        </span>
      );
    case 'VICTORY':
      return <span className="text-yellow-400 font-black tracking-tighter">치킨 달성! 🍗</span>;
    case 'PHASE_START':
      return <span className="text-blue-400/80">Phase {event.phase ?? '?'} 시작</span>;
    default:
      return <span className="text-gray-500">{event.type}: {event.victim || event.weapon}</span>;
  }
};
