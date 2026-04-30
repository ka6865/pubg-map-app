"use client";

import React, { useState, useEffect } from "react";
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
  Map as MapIcon
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { MatchData } from "../../types/stat";

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
  const router = useRouter();

  // 맵 이름 매핑 (한글/영문 -> 내부 mapId)
  const getMapId = (name: string) => {
    const mapping: Record<string, string> = {
      "에란겔": "erangel",
      "미라마": "miramar",
      "사녹": "sanhok",
      "태이고": "taego",
      "데스턴": "deston",
      "론도": "rondo",
      "비켄디": "vikendi",
      "카라킨": "karakin",
      "파라모": "paramo",
      "헤이븐": "haven",
      "Baltic_Main": "erangel",
      "Desert_Main": "miramar",
      "Savage_Main": "sanhok",
      "Tiger_Main": "taego",
      "Kiki_Main": "deston",
      "Neon_Main": "rondo",
      "Chimera_Main": "vikendi"
    };
    return mapping[name] || name.toLowerCase().replace(/_main/i, "");
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
        if (!data.error) setMatchData(data);
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
    if (isAnalyzing || analysis) return;

    setIsAnalyzing(true);
    setAnalysis("");
    
    const abortController = new AbortController();
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
            lineBuffer = lines.pop() || ""; // 마지막 미완성 라인 유지

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const parsed = JSON.parse(line);
                if (parsed.type === "chunk") {
                  accumulatedAnalysis += parsed.data;
                  setAnalysis(accumulatedAnalysis);
                } else if (parsed.type === "done") {
                  // 분석 완료
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
      if (err.name !== 'AbortError') console.error("Analysis Error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (loading) {
    return <div className="h-24 bg-white/5 border border-white/10 rounded-2xl animate-pulse mb-3" />;
  }

  if (!matchData) return null;

  const isRanked = matchData.matchType === 'competitive' || 
                   (matchData.gameMode || "").includes("competitive") ||
                   (matchData.gameMode || "").includes("ranked") ||
                   // [V11] 정원 기반 폴백 판별 (경쟁전은 통상 64인)
                   (matchData.stats.winPlace <= 16 && (matchData.gameMode || "").includes("squad") && ! (matchData.gameMode || "").includes("ai-match"));
  const isWin = matchData.stats.winPlace === 1;
  const isTop10 = matchData.stats.winPlace <= 10;
  
  const totalScale = matchData.totalTeams || 0;
  
  const themeColor = isRanked ? "amber-500" : "indigo-500";
  const borderColor = isRanked ? "border-amber-500/30 hover:border-amber-500/60" : "border-white/10 hover:border-white/20";
  const bgGradient = isRanked 
    ? "bg-gradient-to-br from-black/80 via-black/60 to-[#1a1508]" 
    : "bg-black/40 hover:bg-black/50";

  return (
    <div className={`mb-4 rounded-[2rem] border transition-all duration-300 overflow-hidden shadow-2xl ${borderColor} ${bgGradient} ${isExpanded ? 'bg-black/80 ring-1 ring-white/5' : ''}`}>
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
                <span className="text-indigo-400 font-black text-sm">{Math.floor(matchData.stats.damageDealt)}</span>
                <span className="text-[10px] text-indigo-400/60 font-bold uppercase">Dmg</span>
              </div>
              {(matchData.teamImpact?.damageImpact ?? 0) > 0 && (
                <>
                  <div className="w-1 h-1 bg-white/10 rounded-full" />
                  <div className="flex items-center gap-1 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20" title="팀 내 딜량 비중">
                    <Flame size={10} className="text-orange-500" />
                    <span className="text-[10px] text-orange-500 font-black">팀 딜량 {matchData.teamImpact?.damageImpact}%</span>
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

        {/* V3 Tactical Badges */}
        <div className="flex items-center justify-between md:justify-end gap-3">
          {matchData.myRank && (
            <div className="flex gap-2">
              <div className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 group/rank">
                <Trophy size={14} className="text-amber-500 group-hover/rank:scale-110 transition-transform" />
                <span className="text-[11px] font-black text-amber-500">킬 순위 #{matchData.myRank.killRank || 1}</span>
              </div>
              <div className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 group/perc">
                <Flame size={14} className="text-emerald-500 group-hover/perc:animate-pulse" />
                <div className="flex flex-col">
                  <span className="text-[11px] font-black text-emerald-500 leading-none">상위 {100 - matchData.myRank.damagePercentile}%</span>
                  <span className="text-[8px] font-bold text-emerald-500/60 leading-none mt-1">딜량 상위</span>
                </div>
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
        <div className="p-6 pt-0 border-t border-white/5 animate-in slide-in-from-top-4 duration-500">
          {/* Detailed Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <StatBox icon={<Crosshair size={16} />} label="헤드샷" value={matchData.stats.headshotKills} color="text-red-400" />
            <StatBox icon={<Zap size={16} />} label="어시스트" value={matchData.stats.assists} color="text-indigo-400" />
            <StatBox icon={<Shield size={16} />} label="기절시킴" value={matchData.stats.DBNOs} color="text-yellow-400" />
            <StatBox icon={<Clock size={16} />} label="생존시간" value={`${Math.floor(matchData.stats.timeSurvived / 60)}분`} color="text-green-400" />
          </div>

          {/* V8.1 Tactical Contribution Dashboard */}
          {matchData.tradeStats && (
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                  <ShieldAlert size={16} className="text-emerald-400" />
                </div>
                <div className="flex flex-col">
                  <span className="text-white font-black text-sm">전술적 기여도</span>
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Fact-Based Performance Metrics</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <TacticalBox 
                  icon={<Flame size={18} />} 
                  label="견제 사격" 
                  value={matchData.tradeStats.suppCount} 
                  subLabel="아군 위기 시 지원"
                  color="text-orange-400"
                  bgColor="bg-orange-400/10"
                  tooltip="아군이 기절 상태일 때 주변의 적에게 데미지를 입히거나 사격하여 엄호한 횟수입니다."
                />
                <TacticalBox 
                  icon={<Heart size={18} />} 
                  label="부활 성공" 
                  value={matchData.tradeStats.revCount} 
                  subLabel="직접 구조 완료"
                  color="text-pink-400"
                  bgColor="bg-pink-400/10"
                  tooltip="기절한 팀원을 직접 끝까지 부활시켜 전장에 복귀시킨 횟수입니다."
                />
                <TacticalBox 
                  icon={<MousePointer2 size={18} />} 
                  label="유틸리티 기여" 
                  value={`${matchData.combatPressure?.utilityHits || 0} Hits`} 
                  subLabel={`${matchData.combatPressure?.utilityDamage || 0} DMG`}
                  color="text-amber-400"
                  bgColor="bg-amber-400/10"
                  tooltip="수류탄, 화염병 등 투척물로 적에게 피해를 준 횟수와 총 데미지입니다."
                />
                <TacticalBox 
                  icon={<Target size={18} />} 
                  label="주도권 성공률" 
                  value={`${matchData.initiative_rate || matchData.initiativeStats?.rate || 0}%`} 
                  subLabel={`선제 공격 승리`}
                  color="text-cyan-400"
                  bgColor="bg-cyan-400/10"
                  tooltip="선제 공격(먼저 사격)을 시작한 교전 세션 중, 승리(적 기절/킬)한 비율입니다."
                />
                <TacticalBox 
                  icon={<Clock size={18} />} 
                  label="트레이드 속도" 
                  value={`${(matchData.tradeStats.tradeLatencyMs ?? 0) > 0 ? (matchData.tradeStats.tradeLatencyMs! / 1000).toFixed(2) : 0}s`} 
                  subLabel={`아군 손실 복구`}
                  color="text-indigo-400"
                  bgColor="bg-indigo-400/10"
                  tooltip="아군이 기절한 직후, 해당 적을 눕히거나 킬하여 상황을 반전시킨 평균 시간입니다."
                />
                <TacticalBox 
                  icon={<ShieldAlert size={18} />} 
                  label="사망 페이즈" 
                  value={`${matchData.deathPhase || 0} Ph`} 
                  subLabel={`${matchData.deathPhase || 0}페이즈 생존`}
                  color="text-emerald-400"
                  bgColor="bg-emerald-400/10"
                  tooltip="사망 시점의 자기장 페이즈 번호입니다. 숫자가 높을수록 후반까지 생존했다는 의미입니다."
                />
              </div>
            </div>
          )}

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
                    const cleanAnalysis = analysis.trim();
                    const isJson = cleanAnalysis.startsWith('{') || cleanAnalysis.startsWith('```json');
                    if (!isJson) return (
                      <div className="p-8 bg-black/40 rounded-[2.5rem] border border-white/10 prose prose-invert max-w-none">
                        {renderMarkdown(analysis)}
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
                        {renderMarkdown(analysis)}
                      </div>
                    );
                  }
                })()}
              </div>
            ) : (
              <button 
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className={`w-full py-16 ${isRanked ? 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10' : 'bg-indigo-500/5 border-indigo-500/20 hover:bg-indigo-500/10'} border-2 border-dashed rounded-[2.5rem] flex flex-col items-center gap-4 group transition-all relative overflow-hidden`}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                {isAnalyzing ? (
                  <div className={`w-8 h-8 border-3 border-white/10 ${isRanked ? 'border-t-amber-500' : 'border-t-indigo-500'} rounded-full animate-spin`} />
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
              {matchData.team?.map((member, idx) => {
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
                        <span className="text-sm font-black text-red-400">{member.kills}</span>
                      </div>
                      <div className="bg-black/20 p-2 rounded-xl flex flex-col items-center">
                        <span className="text-[9px] text-gray-500 font-bold uppercase">Assists</span>
                        <span className="text-sm font-black text-indigo-400">{member.assists}</span>
                      </div>
                      <div className="bg-black/20 p-2 rounded-xl flex flex-col items-center">
                        <span className="text-[9px] text-gray-500 font-bold uppercase">DBNOs</span>
                        <span className="text-sm font-black text-yellow-500">{member.DBNOs}</span>
                      </div>
                      <div className="bg-black/20 p-2 rounded-xl flex flex-col items-center">
                        <span className="text-[9px] text-gray-500 font-bold uppercase">Damage</span>
                        <span className="text-sm font-black text-white">{Math.floor(member.damageDealt)}</span>
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

const TacticalBox = ({ icon, label, value, subLabel, color, bgColor, tooltip }: { icon: React.ReactNode, label: string, value: number | string, subLabel: string, color: string, bgColor: string, tooltip?: string }) => (
  <div className={`p-4 rounded-3xl border border-white/5 ${bgColor} flex flex-col gap-3 group/box hover:border-white/20 transition-all relative overflow-visible`}>
    <div className="flex items-center justify-between">
      <div className={`${color} group-hover/box:scale-110 transition-transform`}>{icon}</div>
      <div className="flex items-center gap-1">
        <span className="text-xl font-black text-white">{value}</span>
        {tooltip && (
          <div className="relative group/tooltip">
            <div className="w-3 h-3 rounded-full border border-white/20 flex items-center justify-center text-[8px] text-gray-500 cursor-help hover:border-white/40 hover:text-gray-300">?</div>
            <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-black/90 border border-white/10 rounded-xl text-[9px] text-gray-400 font-medium leading-normal opacity-0 pointer-events-none group-hover/tooltip:opacity-100 transition-opacity z-50 shadow-2xl">
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
