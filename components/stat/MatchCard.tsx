"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  ChevronDown, 
  Target, 
  Zap, 
  Shield, 
  Crosshair, 
  BarChart2, 
  Trophy,
  Flame,
  MousePointer2,
  Clock,
  Swords,
  User,
  Wind,
  Heart,
  Skull,
  ShieldAlert,
  TrendingUp,
  PlayCircle,
  ExternalLink,
  X
} from "lucide-react";
import { useRouter } from "next/navigation";
import { MatchTimeline } from "./MatchTimeline";
import dynamic from "next/dynamic";
import type { MatchData } from "../../types/stat";
import { estimateUserTier } from "@/lib/pubg-analysis/benchmarkScore";
import { useAIStatus, aiManager } from "@/lib/ai-management";

const TimelineMiniMap = dynamic(
  () => import("./TimelineMiniMap").then((mod) => mod.TimelineMiniMap),
  { ssr: false, loading: () => <div className="w-full h-full bg-white/5 animate-pulse rounded-[2.5rem]" /> }
);

const ScoreBar = ({ label, score, max, color }: { label: string, score: number, max: number, color: string }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex justify-between items-center text-[11px]">
      <span className="text-gray-400 font-bold tracking-tight">{label}</span>
      <span className="text-white font-black">{score} <span className="text-white/20 font-medium">/ {max}</span></span>
    </div>
    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/10 relative">
      <div 
        className={`h-full ${color} transition-all duration-1000 ease-out shadow-[0_0_12px_rgba(255,255,255,0.15)] relative z-10`}
        style={{ width: `${Math.min(100, (score / max) * 100)}%` }}
      />
      {/* 배경 가이드라인 */}
      <div className="absolute inset-0 flex justify-between px-1 pointer-events-none opacity-10">
        <div className="w-px h-full bg-white" />
        <div className="w-px h-full bg-white" />
        <div className="w-px h-full bg-white" />
      </div>
    </div>
  </div>
);

const getRelativeTime = (dateStr: string) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMins = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays > 0) return `${diffInDays}일 전`;
  if (diffInHours > 0) return `${diffInHours}시간 전`;
  if (diffInMins > 0) return `${diffInMins}분 전`;
  return "방금 전";
};

/**
 * 간단한 마크다운 파서를 통해 AI 응답을 시각적으로 예쁘게 렌더링합니다.
 */
const renderMarkdown = (text: string) => {
  if (!text) return null;
  const lines = text.split('\n');
  
  return lines.map((line, idx) => {
    if (!line.trim()) return <div key={idx} className="h-2" />;
    
    let isHeader = false;
    let headerLevel = 0;
    if (line.startsWith('### ')) { isHeader = true; headerLevel = 3; }
    else if (line.startsWith('## ')) { isHeader = true; headerLevel = 2; }
    else if (line.startsWith('# ')) { isHeader = true; headerLevel = 1; }
    
    let content = line;
    if (isHeader) content = line.replace(/^#+\s/, '');

    const isList = /^[*\-]\s/.test(content.trim());
    const isBold = /\*\*(.*?)\*\*/g.test(content);

    let elements: React.ReactNode = content;
    if (isBold) {
      const parts = content.split(/(\*\*.*?\*\*)/g);
      elements = parts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={pIdx} className="text-white font-bold">{part.slice(2, -2)}</strong>;
        }
        return part;
      });
    }

    if (isHeader) {
      return (
        <div key={idx} className="flex items-center gap-2 mt-4 mb-2">
          <div className="w-1 h-4 bg-indigo-500 rounded-full" />
          <h3 className={`font-black text-white ${headerLevel === 1 ? 'text-lg' : 'text-md'}`}>
            {elements}
          </h3>
        </div>
      );
    }

    if (isList) {
      return (
        <div key={idx} className="flex gap-2 mb-1 pl-2">
          <span className="text-indigo-400">•</span>
          <span className="text-gray-300 text-sm leading-relaxed">{elements}</span>
        </div>
      );
    }

    return (
      <p key={idx} className="text-gray-400 text-sm leading-relaxed mb-2 pl-1">
        {elements}
      </p>
    );
  });
};

interface MatchCardProps {
  matchId: string;
  nickname: string;
  platform: string;
  isMobile: boolean;
  index?: number;
  onNicknameClick?: (nickname: string) => void;
}

export const MatchCard = ({ matchId, nickname, platform, isMobile, index = 0, onNicknameClick }: MatchCardProps) => {
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [coachingStyle, setCoachingStyle] = useState<"mild" | "spicy">("spicy");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [showTierTooltip, setShowTierTooltip] = useState(false);
  const tierRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { isAnalyzing: isGlobalAnalyzing, activeId } = useAIStatus();
  const router = useRouter();

  // [V45.8] 언마운트 시 진행 중인 분석 강제 중단 (토큰 낭비 방지)
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        console.log(`[AI-CLEANUP] Unmounting MatchCard ${matchId}, aborting analysis...`);
        abortControllerRef.current.abort();
        aiManager.stopAnalysis(matchId);
      }
    };
  }, [matchId]);

  useEffect(() => {
    if (!showTierTooltip || !isMobile) return;

    const initialScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (Math.abs(currentScrollY - initialScrollY) > 50) {
        setShowTierTooltip(false);
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (tierRef.current && !tierRef.current.contains(event.target as Node)) {
        setShowTierTooltip(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [showTierTooltip, isMobile]);

  const renderTierBadge = () => {
    const score = matchData?.benchmark?.score || 0;
    const tier = estimateUserTier(score);
    
    // 티어별 색상/스타일 정의
    const getTierStyle = (t: string) => {
      const tier = t.toUpperCase();
      if (tier.startsWith('S')) return "bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)] font-black";
      if (tier.startsWith('A')) return "bg-indigo-500/20 border-indigo-500/50 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.15)]";
      if (tier.startsWith('B')) return "bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]";
      if (tier.startsWith('C')) return "bg-blue-500/20 border-blue-500/50 text-blue-400";
      if (tier.startsWith('D')) return "bg-slate-500/20 border-slate-500/50 text-slate-400";
      return "bg-white/5 border-white/10 text-gray-400";
    };

    return (
      <button 
        onMouseEnter={() => !isMobile && setShowTierTooltip(true)}
        onMouseLeave={() => !isMobile && setShowTierTooltip(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (isMobile) setShowTierTooltip(!showTierTooltip);
        }}
        className={`px-4 py-1.5 rounded-xl border flex items-center gap-2 transition-all cursor-help hover:scale-105 active:scale-95 ${getTierStyle(tier)}`}
      >
        <span className="text-sm font-black italic tracking-tighter">{tier} Tier</span>
        <div className="w-px h-3 bg-current opacity-20" />
        <span className="text-[11px] font-black">{score}pt</span>
      </button>
    );
  };

  // 맵 이름 매핑 (한글/영문 -> 내부 mapId)
  const getMapId = (name: string) => {
    const mapping: Record<string, string> = {
      "에란겔": "Erangel",
      "미라마": "Miramar",
      "사녹": "Sanhok",
      "태이고": "Taego",
      "데스턴": "Deston",
      "론도": "Rondo",
      "비켄디": "Vikendi",
      "카라킨": "Karakin",
      "파라모": "Paramo",
      "헤이븐": "Haven",
      "Baltic_Main": "Erangel",
      "Desert_Main": "Miramar",
      "Savage_Main": "Sanhok",
      "Tiger_Main": "Taego",
      "Kiki_Main": "Deston",
      "Neon_Main": "Rondo",
      "Chimera_Main": "Vikendi"
    };
    const mapped = mapping[name];
    if (mapped) return mapped;

    // 폴백 로직: 첫 글자 대문자화 (예: erangel -> Erangel)
    const fallback = name.toLowerCase().replace(/_main/i, "");
    return fallback.charAt(0).toUpperCase() + fallback.slice(1);
  };

  const mapId = getMapId(matchData?.mapName || "");

  const handleInternalReplay = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/maps/${mapId}?playback=${matchId}&nickname=${nickname}`);
  };

  useEffect(() => {
    const fetchMatch = async () => {
      try {
        const res = await fetch(`/api/pubg/match?matchId=${matchId}&nickname=${nickname}&platform=${platform}`, { cache: 'no-store' });
        const data = await res.json();
        
        if (!data.error) {
          // [V45.2] 정규 매치 필터링 (이벤트, 아케이드, 훈련소 등 제외)
          const mode = (data.gameMode || "").toLowerCase();
          const map = data.mapName || "";
          const isStandardMatch = 
            !mode.includes("event") &&
            !mode.includes("arcade") &&
            !mode.includes("custom") &&
            !mode.includes("training") &&
            !mode.includes("flare") &&
            !mode.includes("ai-match") &&
            !map.includes("SafeHouse") &&
            !map.includes("Range_Main");

          if (isStandardMatch) {
            setMatchData(data);
          }
        }
      } catch (err) {
        console.error("Match Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    };
    
    // 개발 서버 환경 등에서 동시 요청으로 인한 병목을 줄이기 위해 인덱스 기반으로 딜레이 분산
    const delay = index * 300;
    const timer = setTimeout(() => {
      fetchMatch();
    }, delay);
    
    return () => clearTimeout(timer);
  }, [matchId, nickname, platform, index]);

  const handleAnalyze = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // [V45.9] 전역 락 체크: 내가 분석 중인 게 아니면 다른 분석 시작 금지
    if (isGlobalAnalyzing || isAnalyzing || analysis) return;

    if (!aiManager.startAnalysis(matchId)) return;
    
    setIsAnalyzing(true);
    setAnalysis("");
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    let lineBuffer = "";
    
    try {
      const res = await fetch("/api/pubg/ai-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({ matchData, nickname, coachingStyle })
      });

      if (!res.ok) throw new Error("분석 요청 실패");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedAnalysis = "";

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            lineBuffer += decoder.decode(value, { stream: true });
            const lines = lineBuffer.split("\n");
            lineBuffer = lines.pop() || ""; 

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const parsed = JSON.parse(line);
                if (parsed.type === "chunk") {
                  accumulatedAnalysis += parsed.data;
                  setAnalysis(accumulatedAnalysis);
                }
              } catch (e) {
                console.error("NDJSON Parse Error in MatchCard:", e, line);
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error("Analysis Error:", err);
      }
    } finally {
      setIsAnalyzing(false);
      aiManager.stopAnalysis(matchId);
      abortControllerRef.current = null;
    }
  };

  if (loading) {
    return <div className="h-24 bg-white/5 border border-white/10 rounded-2xl animate-pulse mb-3" />;
  }

  if (!matchData) return null;

  const isRanked = matchData.matchType === 'competitive' || 
                   (matchData.gameMode || "").includes("competitive") ||
                   (matchData.gameMode || "").includes("ranked") ||
                   // [V11.9] 경쟁전 판정 정밀화: 16위 이내 + 전체 16팀 규격 + 경쟁전 가능 맵인 경우만 인정
                   (
                     matchData.stats.winPlace <= 16 && 
                     matchData.totalTeams === 16 && 
                     !["사녹", "카라킨", "파라모", "헤이븐"].includes(matchData.mapName || "") &&
                     (matchData.gameMode || "").includes("squad") && 
                     !(matchData.gameMode || "").includes("ai-match")
                   );
  const isWin = matchData.stats.winPlace === 1;
  const isTop10 = matchData.stats.winPlace <= 10;
  
  const totalScale = matchData.totalTeams || 0;
  
  const themeColor = isRanked ? "amber-500" : "indigo-500";
  const borderColor = isRanked ? "border-amber-500/30 hover:border-amber-500/60" : "border-white/10 hover:border-white/20";
  const bgGradient = isRanked 
    ? "bg-gradient-to-br from-black/80 via-black/60 to-[#1a1508]" 
    : "bg-black/40 hover:bg-black/50";

  return (
    <div className={`mb-4 rounded-[2rem] border transition-all duration-300 shadow-2xl relative ${borderColor} ${bgGradient} ${(isExpanded || showTierTooltip) ? 'bg-[#0c0c0c] ring-1 ring-white/20 z-[999] isolation-isolate' : 'z-10'} hover:z-[70]`}>
      {/* Header Area */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-5 flex flex-col md:flex-row md:items-center justify-between cursor-pointer group gap-4"
      >
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-black transition-transform group-hover:scale-105 ${
            isWin ? 'bg-amber-500 text-black shadow-[0_0_20px_rgba(245,158,11,0.3)]' : 
            isTop10 ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 
            'bg-white/5 text-gray-400 border border-white/10'
          }`}>
            <span className="text-[9px] uppercase tracking-tighter opacity-70">Rank</span>
            <span className="text-xl">#{matchData.stats.winPlace}</span>
            <span className="text-[8px] opacity-50 mt-0.5">/ {totalScale}</span>
          </div>

          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-white font-black text-lg tracking-tight">{matchData.mapName}</span>
              <span className="text-[10px] text-white/30 font-bold">{getRelativeTime(matchData.createdAt)}</span>
              <div className="flex gap-1.5">
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${isRanked ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.1)]' : 'bg-white/10 text-gray-400 border border-white/10'}`}>
                  {isRanked && <Swords size={10} />}
                  {isRanked ? "경쟁전" : "일반전"}
                </span>
                <span className="px-2 py-0.5 bg-white/5 rounded text-[10px] text-gray-400 font-bold uppercase tracking-wider border border-white/5">
                  {(() => {
                    const mode = (matchData.gameMode || "").toLowerCase();
                    const isFpp = mode.includes("fpp");
                    const type = mode.includes("solo") ? "솔로" : mode.includes("duo") ? "듀오" : "스쿼드";
                    return `${isFpp ? "1인칭" : "3인칭"} ${type}`;
                  })()}
                </span>
              </div>
            </div>
            <div className="flex gap-4 items-center">
              <div className="flex items-baseline gap-1">
                <span className="text-red-400 font-black text-sm">{matchData.stats.kills}</span>
                <span className="text-[10px] text-red-400/60 font-bold uppercase">Kills</span>
              </div>
              <div className="w-1 h-1 bg-white/10 rounded-full" />
              <div className="flex items-baseline gap-1">
                <span className="text-indigo-400 font-black text-sm">{Math.floor(Number(matchData.stats.damageDealt) || 0)}</span>
                <span className="text-[10px] text-indigo-400/60 font-bold uppercase">Dmg</span>
              </div>
              {(matchData.teamImpact?.teamDamageShare ?? 0) > 0 && (
                <>
                  <div className="w-1 h-1 bg-white/10 rounded-full" />
                  <div className="flex items-center gap-1 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20" title="팀 내 딜량 비중">
                    <Flame size={10} className="text-orange-500" />
                    <span className="text-[10px] text-orange-500 font-black">팀 딜량 {Number(matchData.teamImpact?.teamDamageShare || 0).toFixed(1)}%</span>
                  </div>
                </>
              )}
            </div>
            {/* Tactical Badges Display */}
            {matchData.badges && matchData.badges.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {matchData.badges.map((badge: any, i: number) => {
                  let badgeIcon = "🏅";
                  if (badge.id === "smoke_master") badgeIcon = "💨";
                  else if (badge.id === "sharpshooter") badgeIcon = "🎯";
                  else if (badge.id === "zone_wizard") badgeIcon = "⚡️";
                  else if (badge.id === "last_survivor") badgeIcon = "🛡️";
                  else if (badge.id === "damage_carry") badgeIcon = "🔥";
                  
                  return (
                    <div key={i} className="flex items-center gap-1 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-[9px] font-bold text-gray-300">
                      <span>{badgeIcon}</span>
                      <span>{badge.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* V3 Tactical Badges & Tier */}
        <div className="flex items-center justify-between md:justify-end gap-3">
          {matchData.benchmark && (
            <div className="relative" ref={tierRef}>
              {renderTierBadge()}
              
              {/* Tooltip Breakdown */}
              {showTierTooltip && (
                <div 
                  ref={tooltipRef}
                  onClick={(e) => e.stopPropagation()}
                  className={`${
                    isMobile 
                    ? 'fixed inset-x-4 bottom-20 animate-in slide-in-from-bottom-5' 
                    : 'absolute bottom-full right-0 mb-3 w-64 animate-in fade-in zoom-in-95'
                  } bg-[#0a0a0a] border border-white/20 p-5 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.9)] transition-all duration-300 z-[1001] border-t-white/40`}
                >
                  <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-4">
                    <div className="text-[12px] font-black text-indigo-400 uppercase tracking-widest">
                      매치 상세 분석
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white bg-indigo-500 px-2 py-0.5 rounded-full text-[10px] tabular-nums">
                        {matchData.benchmark.score} / 100
                      </span>
                      {isMobile && (
                        <button onClick={() => setShowTierTooltip(false)} className="text-white/40">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <ScoreBar label="전투 (Combat)" score={matchData.benchmark.breakdown.combat} max={isRanked ? 40 : 50} color="bg-gradient-to-r from-red-600 to-red-400" />
                    <ScoreBar label="전술 (Tactical)" score={matchData.benchmark.breakdown.tactical} max={isRanked ? 35 : 15} color="bg-gradient-to-r from-indigo-600 to-indigo-400" />
                    <ScoreBar label="생존 (Survival)" score={matchData.benchmark.breakdown.survival} max={isRanked ? 25 : 35} color="bg-gradient-to-r from-emerald-600 to-emerald-400" />
                  </div>

                  {/* Key Logic Indicators */}
                  <div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/10 pt-4">
                    <div className="flex items-center gap-2 bg-white/5 p-2 rounded-xl border border-white/5">
                      <Crosshair size={12} className="text-red-400" />
                      <div className="flex flex-col">
                        <span className="text-[8px] text-gray-500 font-bold">전투 영향력</span>
                        <span className="text-[10px] text-white font-black">{Math.floor(matchData.stats.damageDealt)} dmg</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white/5 p-2 rounded-xl border border-white/5">
                      <Zap size={12} className="text-amber-400" />
                      <div className="flex flex-col">
                        <span className="text-[8px] text-gray-500 font-bold">반응 속도</span>
                        <span className="text-[10px] text-white font-black">
                          {matchData.tradeStats?.reactionLatencyMs && matchData.tradeStats.reactionLatencyMs > 0 
                            ? `${Math.floor(matchData.tradeStats.reactionLatencyMs)}ms` 
                            : '측정 불가'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white/5 p-2 rounded-xl border border-white/5">
                      <Shield size={12} className="text-indigo-400" />
                      <div className="flex flex-col">
                        <span className="text-[8px] text-gray-500 font-bold">전술 기여</span>
                        <span className="text-[10px] text-white font-black">팀전멸 {matchData.tradeStats?.enemyTeamWipes || 0}회</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white/5 p-2 rounded-xl border border-white/5">
                      <Clock size={12} className="text-emerald-400" />
                      <div className="flex flex-col">
                        <span className="text-[8px] text-gray-500 font-bold">생존력</span>
                        <span className="text-[10px] text-white font-black">{Math.floor(matchData.stats.timeSurvived / 60)}분 생존</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 text-[9px] text-gray-400 leading-relaxed font-medium bg-white/5 p-2 rounded-lg border border-white/5 italic">
                    * 딜량, 선제공격, 반응속도, 팀기여, 생존시간 등을 종합 분석한 실력 점수입니다.
                  </div>
                </div>
              )}
            </div>
          )}

          {matchData.myRank && (
            <div className="flex gap-2 hidden md:flex">
              <div className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 group/rank">
                <Trophy size={14} className="text-amber-500 group-hover/rank:scale-110 transition-transform" />
                <span className="text-[11px] font-black text-amber-500">킬 순위 #{matchData.myRank.killRank || 1}</span>
              </div>
            </div>
          )}
          <div className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <ChevronDown className={`text-gray-500 transition-transform duration-500 ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </div>

      {/* Quick Action Bar (Floating) */}
      <div className="px-5 pb-4 flex flex-wrap gap-3">
        <button 
          onClick={handleInternalReplay}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-tighter transition-all hover:scale-105 active:scale-95
            ${isRanked ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'}`}
        >
          <PlayCircle size={14} />
          2D 리플레이
        </button>

        <button 
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/maps/${mapId}?playback=${matchId}&nickname=${nickname}&mode=full`);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-tighter transition-all hover:scale-105 active:scale-95 bg-gradient-to-r from-yellow-500/20 to-orange-600/20 text-yellow-500 border border-yellow-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
        >
          <span className="text-sm">💎</span>
          고정밀 리플레이 (원본 데이터)
        </button>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-3 md:p-6 pt-0 border-t border-white/5 animate-in slide-in-from-top-4 duration-500 bg-[#0c0c0c] rounded-b-[2rem] isolation-isolate relative z-10">
          {/* Detailed Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <StatBox icon={<Crosshair size={16} />} label="헤드샷" value={Number(matchData!.stats.headshotKills) || 0} color="text-red-400" />
            <StatBox icon={<Zap size={16} />} label="어시스트" value={Number(matchData!.stats.assists) || 0} color="text-indigo-400" />
            <StatBox icon={<Shield size={16} />} label="기절시킴" value={Number(matchData!.stats.DBNOs) || 0} color="text-yellow-400" />
            <StatBox icon={<Clock size={16} />} label="생존시간" value={`${Math.floor((Number(matchData!.stats.timeSurvived) || 0) / 60)}분`} color="text-green-400" />
          </div>

          {/* [V12.5] New Tactical Dashboard (Radar + Timeline) */}
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                <Target size={16} className="text-indigo-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-white font-black text-sm">전술 위치 분석</span>
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Tactical Location & Match Timeline</span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 md:gap-6">
              {/* Left: Mini Map */}
              <div className="lg:col-span-5 xl:col-span-4 bg-white/2 border border-white/5 rounded-[2.5rem] overflow-hidden min-h-[300px] lg:min-h-0 lg:h-[500px] relative group/map">
                <div className="absolute top-4 left-4 z-10 px-3 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-full text-[9px] text-gray-400 font-black uppercase tracking-widest opacity-0 group-hover/map:opacity-100 transition-opacity">
                  Interactive Tactical Map
                </div>
                <TimelineMiniMap 
                  selectedEvent={selectedEvent}
                  mapId={mapId} 
                />
                {!selectedEvent && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] pointer-events-none z-20">
                    <div className="bg-black/80 backdrop-blur-xl px-5 py-3 rounded-2xl border border-white/10 flex flex-col items-center gap-2 shadow-2xl scale-90 md:scale-100">
                      <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center mb-1">
                        <MousePointer2 size={20} className="text-blue-400 animate-bounce" />
                      </div>
                      <span className="text-[11px] text-white font-black tracking-tight">타임라인 이벤트를 클릭하여 위치 확인</span>
                      <span className="text-[9px] text-gray-500 font-bold">전술 상황이 일어난 지점을 지도에 표시합니다</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Timeline */}
              <div className="lg:col-span-7 xl:col-span-8 bg-white/2 border border-white/5 rounded-[2.5rem] p-2 md:p-6 lg:h-[500px] flex flex-col">
                <div className="flex items-center justify-between mb-6 shrink-0">
                  <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Match Timeline</div>
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[10px] text-gray-400 font-bold">
                    <Clock size={10} />
                    <span>{Math.floor(matchData!.stats.timeSurvived / 60)}m {matchData!.stats.timeSurvived % 60}s Survived</span>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  <MatchTimeline 
                    events={matchData!.timeline || []} 
                    nickname={nickname}
                    onEventClick={(event: any) => {
                      console.log("Event Clicked:", event.type, "Coords:", event.x, event.y);
                      setSelectedEvent(event);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* AI Analysis Section */}
          <div className="mt-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2">
                <div className={`w-10 h-10 ${isRanked ? 'bg-amber-500/20' : 'bg-indigo-500/20'} rounded-xl flex items-center justify-center`}>
                  <BarChart2 size={20} className={isRanked ? 'text-amber-500' : 'text-indigo-400'} />
                </div>
                <div>
                  <h3 className="text-white font-black text-lg">AI 전술 코칭</h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Tactical Analysis</p>
                </div>
              </div>
              
              <div className="flex gap-2 bg-black/40 p-1 rounded-2xl border border-white/10">
                <button 
                  onClick={(e) => { e.stopPropagation(); setCoachingStyle("mild"); setAnalysis(null); }}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                    coachingStyle === 'mild' 
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <span>😊</span> 다정한 맛
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setCoachingStyle("spicy"); setAnalysis(null); }}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                    coachingStyle === 'spicy' 
                      ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' 
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <span>🔥</span> 매운맛
                </button>
              </div>
            </div>

            {analysis ? (
              <div className="flex flex-col gap-6 animate-in fade-in zoom-in duration-500">
                {(() => {
                  try {
                    const cleanAnalysis = analysis!.trim();
                    const isJson = cleanAnalysis.startsWith('{') || cleanAnalysis.startsWith('```json');
                    if (!isJson) return (
                      <div className="p-8 bg-black/40 rounded-[2.5rem] border border-white/10 prose prose-invert max-w-none">
                        {renderMarkdown(analysis!)}
                      </div>
                    );
                    
                    let data;
                    try {
                      const jsonString = cleanAnalysis.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
                      data = JSON.parse(jsonString);
                    } catch (e) {
                      if (isAnalyzing) {
                        return (
                          <div className="p-10 bg-black/40 rounded-[2.5rem] border border-white/10 flex flex-col items-center justify-center gap-4">
                            <div className={`w-10 h-10 border-4 border-white/10 border-t-${coachingStyle === 'mild' ? 'emerald' : 'red'}-500 rounded-full animate-spin`} />
                            <p className="text-gray-400 font-bold animate-pulse tracking-widest text-sm">AI 전술 데이터를 수신하고 있습니다...</p>
                          </div>
                        );
                      }
                      throw e;
                    }
                    const isMildTheme = coachingStyle === "mild";
                    const accentColor = isMildTheme ? "emerald" : "red";
                    
                    return (
                      <div className="flex flex-col gap-6">
                        {/* Style Header */}
                        <div className={`relative p-8 bg-gradient-to-br from-${accentColor}-500/10 to-transparent border border-${accentColor}-500/20 rounded-[2.5rem] overflow-hidden`}>
                          <div className="absolute top-0 right-0 p-6 opacity-10">
                            <span className="text-8xl">{isMildTheme ? "😊" : "🔥"}</span>
                          </div>
                          <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-4">
                              <span className={`px-3 py-1 bg-${accentColor}-500/20 text-${accentColor}-400 rounded-full text-[10px] font-black uppercase tracking-widest`}>
                                {data.coach || (isMildTheme ? "KIND COACH" : "SPICY BOMBER")}
                              </span>
                              <div className={`h-1 w-1 rounded-full bg-${accentColor}-500`} />
                              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Match Report</span>
                            </div>
                            <h3 className="text-3xl font-black text-white mb-2 leading-tight">{data.signature}</h3>
                            <p className="text-gray-400 text-sm font-medium">{data.signatureSub}</p>
                          </div>
                        </div>

                        {/* Analysis Content (3 Lines) */}
                        <div className="flex flex-col gap-4">
                          <div className="grid grid-cols-1 gap-3">
                            {data.briefFeedback?.map((point: string, idx: number) => (
                              <div key={idx} className="flex gap-4 p-4 bg-white/5 border border-white/10 rounded-2xl items-center group/point hover:bg-white/10 transition-colors">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                  idx === 0 ? 'bg-amber-500/20 text-amber-500' : 
                                  idx === 1 ? 'bg-indigo-500/20 text-indigo-400' : 
                                  'bg-emerald-500/20 text-emerald-400'
                                }`}>
                                  <span className="text-xs font-black">{idx + 1}</span>
                                </div>
                                <p className="text-gray-200 text-sm font-medium leading-relaxed">
                                  {point}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Final Verdict & Action Items */}
                        <div className={`p-8 bg-black/60 border border-${accentColor}-500/30 rounded-[2.5rem] relative overflow-hidden shadow-2xl`}>
                           <div className={`absolute inset-0 bg-${accentColor}-500/5 pointer-events-none`} />
                           <div className="relative z-10">
                             <div className="flex items-center gap-2 mb-4">
                               <span className={`text-[10px] font-black text-${accentColor}-400 uppercase tracking-[0.2em]`}>Final Coaching Verdict</span>
                               <div className="flex-1 h-px bg-white/5" />
                             </div>
                             <p className="text-xl font-black text-white leading-tight mb-8">&quot;{data.finalVerdict}&quot;</p>
                             
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               {data.actionItems?.map((item: any, idx: number) => (
                                 <div key={idx} className="flex items-start gap-4 p-5 bg-white/5 rounded-[1.5rem] border border-white/10 hover:bg-white/10 transition-colors group/item">
                                   <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-2xl group-hover/item:scale-110 transition-transform">
                                     {item.icon}
                                   </div>
                                   <div className="flex flex-col gap-1">
                                     <span className="text-sm font-black text-white">{item.title}</span>
                                     <span className="text-xs text-gray-400 leading-normal font-medium">{item.desc}</span>
                                   </div>
                                 </div>
                               ))}
                             </div>
                           </div>
                        </div>
                      </div>
                    );
                  } catch (e) {
                    return (
                      <div className="p-8 bg-black/40 rounded-[2.5rem] border border-white/10 prose prose-invert max-w-none">
                        {renderMarkdown(analysis!)}
                      </div>
                    );
                  }
                })()}
              </div>
            ) : (
              <button 
                onClick={handleAnalyze}
                disabled={isGlobalAnalyzing || isAnalyzing}
                className={`w-full py-16 ${isRanked ? 'bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20' : 'bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20'} border-2 border-dashed rounded-[2.5rem] flex flex-col items-center gap-4 group transition-all relative overflow-hidden ${
                  isGlobalAnalyzing && !isAnalyzing ? 'opacity-50 cursor-not-allowed grayscale' : ''
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                {isAnalyzing ? (
                  <div className={`w-8 h-8 border-3 border-white/10 ${isRanked ? 'border-t-amber-500' : 'border-t-indigo-500'} rounded-full animate-spin`} />
                ) : isGlobalAnalyzing ? (
                  <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
                    <Clock size={28} className="text-gray-500" />
                  </div>
                ) : (
                  <div className={`w-14 h-14 rounded-2xl ${isRanked ? 'bg-amber-500/20' : 'bg-indigo-500/20'} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <MousePointer2 className={isRanked ? 'text-amber-500' : 'text-indigo-400'} size={28} />
                  </div>
                )}
                <div className="flex flex-col items-center gap-1 relative z-10">
                  <span className={`${isRanked ? 'text-amber-500' : 'text-indigo-400'} font-black text-lg tracking-tight`}>
                    {isAnalyzing ? "전장 데이터를 복기하는 중..." : "이 매치 정밀 분석 시작하기"}
                  </span>
                  <span className="text-gray-500 text-xs font-medium uppercase tracking-widest">
                    {coachingStyle === 'mild' ? "KIND COACH 모드로 분석" : "SPICY BOMBER 모드로 분석"}
                  </span>
                </div>
              </button>
            )}
          </div>

          {/* Team Members List (웅장한 리뉴얼) */}
          <div className="mt-10 pt-8 border-t border-white/5">
            <div className="flex items-center gap-2 mb-6">
              <span className="text-xs text-gray-500 font-black uppercase tracking-[0.2em]">Team Combat Performance</span>
              <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {matchData!.team?.map((member, idx) => {
                const isMe = member.name === nickname;
                return (
                  <div 
                    key={idx} 
                    onClick={() => !isMe && onNicknameClick?.(member.name)}
                    className={`relative p-4 rounded-3xl border transition-all group/member
                    ${isMe 
                      ? (isRanked ? 'bg-amber-500/10 border-amber-500/30' : 'bg-indigo-500/10 border-indigo-500/30') 
                      : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20 cursor-pointer active:scale-95'
                    }`}>
                    
                    {isMe && (
                      <div className={`absolute -top-2 -right-2 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-tighter
                        ${isRanked ? 'bg-amber-500 text-black' : 'bg-indigo-500 text-white'}`}>
                        YOU
                      </div>
                    )}

                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center
                        ${isMe 
                          ? (isRanked ? 'bg-amber-500/20 text-amber-500' : 'bg-indigo-500/20 text-indigo-400') 
                          : 'bg-white/5 text-gray-500'
                        }`}>
                        <User size={18} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className={`text-sm font-black truncate ${isMe ? 'text-white' : 'text-gray-300'}`}>
                          {member.name}
                        </span>
                        <span className="text-[10px] text-gray-500 font-bold">Player No.{idx + 1}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-black/20 p-2 rounded-xl flex flex-col items-center">
                        <span className="text-[9px] text-gray-500 font-bold uppercase">Kills</span>
                        <span className="text-sm font-black text-red-400">{Number(member.kills) || 0}</span>
                      </div>
                      <div className="bg-black/20 p-2 rounded-xl flex flex-col items-center">
                        <span className="text-[9px] text-gray-500 font-bold uppercase">Assists</span>
                        <span className="text-sm font-black text-indigo-400">{Number(member.assists) || 0}</span>
                      </div>
                      <div className="bg-black/20 p-2 rounded-xl flex flex-col items-center">
                        <span className="text-[9px] text-gray-500 font-bold uppercase">DBNOs</span>
                        <span className="text-sm font-black text-yellow-500">{Number(member.DBNOs) || 0}</span>
                      </div>
                      <div className="bg-black/20 p-2 rounded-xl flex flex-col items-center">
                        <span className="text-[9px] text-gray-500 font-bold uppercase">Damage</span>
                        <span className="text-sm font-black text-white">{Math.floor(Number(member.damageDealt) || 0)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatBox = ({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string | number, color: string }) => (
  <div className="bg-black/40 p-4 rounded-2xl border border-white/5 flex flex-col items-center gap-1 group hover:border-white/10 transition-colors">
    <div className={`${color} mb-1 opacity-70 group-hover:scale-110 transition-transform`}>{icon}</div>
    <span className="text-[10px] text-gray-500 font-black uppercase tracking-tighter">{label}</span>
    <span className="text-lg font-black text-white">{value}</span>
  </div>
);

const TacticalBox = ({ icon, label, value, subLabel, color, bgColor, tooltip, isMobile }: { icon: React.ReactNode, label: string, value: number | string, subLabel: string, color: string, bgColor: string, tooltip?: string, isMobile?: boolean }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTooltip || !isMobile) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTooltip, isMobile]);

  return (
    <div className={`p-4 rounded-3xl border border-white/5 ${bgColor} flex flex-col gap-3 group/box hover:border-white/20 transition-all relative overflow-visible`} ref={tooltipRef}>
      <div className="flex items-center justify-between">
        <div className={`${color} group-hover/box:scale-110 transition-transform`}>{icon}</div>
        <div className="flex items-center gap-1">
          <span className="text-xl font-black text-white">{value}</span>
          {tooltip && (
            <div className="relative">
              <button 
                onMouseEnter={() => !isMobile && setShowTooltip(true)}
                onMouseLeave={() => !isMobile && setShowTooltip(false)}
                onClick={() => isMobile && setShowTooltip(!showTooltip)}
                className={`w-3 h-3 rounded-full border flex items-center justify-center text-[8px] font-bold transition-colors ${showTooltip ? 'bg-white/10 border-white/40 text-white' : 'border-white/20 text-gray-500 hover:border-white/40 hover:text-gray-300'}`}
              >
                ?
              </button>
              <div className={`absolute bottom-full right-0 mb-2 w-56 p-3 bg-[#0a0a0a] backdrop-blur-xl border border-white/20 rounded-2xl text-[10px] text-gray-300 font-medium leading-relaxed transition-opacity z-[100] shadow-[0_10px_40px_rgba(0,0,0,0.8)] ${
                showTooltip ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}>
                {tooltip}
                <div className="absolute top-full right-1 w-2 h-2 bg-black border-r border-b border-white/10 rotate-45 -translate-y-1" />
              </div>
            </div>
          )}
        </div>
      </div>
      <div>
        <p className="text-[11px] text-white font-black uppercase tracking-tight">{label}</p>
        <p className="text-[9px] text-gray-500 font-bold leading-tight mt-1">{subLabel}</p>
      </div>
    </div>
  );
};
