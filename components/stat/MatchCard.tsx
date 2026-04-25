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
  TrendingUp
} from "lucide-react";
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
  onNicknameClick?: (nickname: string) => void;
}

export const MatchCard = ({ matchId, nickname, platform, isMobile, onNicknameClick }: MatchCardProps) => {
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [coachingStyle, setCoachingStyle] = useState<"mild" | "spicy">("spicy");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    const fetchMatch = async () => {
      try {
        const res = await fetch(`/api/pubg/match?matchId=${matchId}&nickname=${nickname}&platform=${platform}`);
        const data = await res.json();
        if (!data.error) setMatchData(data);
      } catch (err) {
        console.error("Match Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchMatch();
  }, [matchId, nickname, platform]);

  const handleAnalyze = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAnalyzing || (analysis && coachingStyle)) return;

    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/pubg/ai-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchData, nickname, coachingStyle })
      });
      const data = await res.json();
      if (data.analysis) setAnalysis(data.analysis);
    } catch (err) {
      console.error("Analysis Error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (loading) {
    return <div className="h-24 bg-white/5 border border-white/10 rounded-2xl animate-pulse mb-3" />;
  }

  if (!matchData) return null;

  const isRanked = matchData.matchType === 'competitive' || (matchData.gameMode || "").includes("competitive");
  const isWin = matchData.stats.winPlace === 1;
  const isTop10 = matchData.stats.winPlace <= 10;
  
  // 게임 모드별 최대 팀 수/인원 계산 로직
  const getTotalScale = () => {
    if (matchData.myRank?.totalTeams) return matchData.myRank.totalTeams;
    
    const mode = (matchData.gameMode || "").toLowerCase();
    const isRankedMode = (matchData.gameMode || "").includes("ranked") || isRanked;
    
    if (mode.includes("solo")) return 100;
    if (mode.includes("duo")) return 50;
    if (isRankedMode) return 16;
    if (mode.includes("squad")) return 25;
    
    // 만약 순위가 폴백값보다 크면 순위에 맞춤
    return Math.max(25, matchData.stats.winPlace);
  };

  const totalScale = getTotalScale();
  
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
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${isRanked ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' : 'bg-white/10 text-gray-400 border border-white/10'}`}>
                  {isRanked && <Swords size={10} />}
                  {isRanked ? "경쟁전" : "일반전"}
                </span>
                <span className="px-2 py-0.5 bg-white/5 rounded text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                  {matchData.gameMode}
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
            </div>
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

          {/* V3.0 Tactical Contribution Dashboard */}
          {matchData.tradeStats && (
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                  <ShieldAlert size={16} className="text-emerald-400" />
                </div>
                <span className="text-white font-black">전술적 기여도 (V3.0)</span>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <TacticalBox 
                  icon={<Flame size={18} />} 
                  label="견제 사격" 
                  value={matchData.tradeStats.suppCount} 
                  subLabel="아군 위기 시 지원"
                  color="text-orange-400"
                  bgColor="bg-orange-400/10"
                />
                <TacticalBox 
                  icon={<Wind size={18} />} 
                  label="연막 세이브" 
                  value={matchData.tradeStats.smokeCount} 
                  subLabel="골든타임(5초) 내 투척"
                  color="text-blue-400"
                  bgColor="bg-blue-400/10"
                />
                <TacticalBox 
                  icon={<Heart size={18} />} 
                  label="부활 성공" 
                  value={matchData.tradeStats.revCount} 
                  subLabel="직접 구조 완료"
                  color="text-pink-400"
                  bgColor="bg-pink-400/10"
                />
                <TacticalBox 
                  icon={<Skull size={18} />} 
                  label="복수/미끼 성공" 
                  value={matchData.tradeStats.baitCount} 
                  subLabel="아군 희생 후 제압"
                  color="text-purple-400"
                  bgColor="bg-purple-400/10"
                />
                <TacticalBox 
                  icon={<Target size={18} />} 
                  label="피킹 정밀도" 
                  value={`${matchData.combatPressure?.maxHitDistance || 0}m`} 
                  subLabel="최대 교전 적중 거리"
                  color="text-emerald-400"
                  bgColor="bg-emerald-400/10"
                />
                <TacticalBox 
                  icon={<Zap size={18} />} 
                  label="투척물 효율" 
                  value={matchData.combatPressure?.utilityHits || 0} 
                  subLabel={`누적 딜량 ${matchData.combatPressure?.utilityDamage || 0}`}
                  color="text-yellow-400"
                  bgColor="bg-yellow-400/10"
                />
                <TacticalBox 
                  icon={<TrendingUp size={18} />} 
                  label="주도권 성공률" 
                  value={`${matchData.initiativeStats?.rate || 0}%`} 
                  subLabel={`먼저 쏴서 이긴 비율`}
                  color="text-cyan-400"
                  bgColor="bg-cyan-400/10"
                />
              </div>

              {/* Response Latency & Backup Rate */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-black/40 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                      <Clock size={18} className="text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500 font-black uppercase">평균 백업 반응속도</p>
                      <p className="text-sm font-black text-white">
                        {matchData.tradeStats.backupLatencyMs > 0 
                          ? (matchData.tradeStats.backupLatencyMs / 1000).toFixed(2) + "초" 
                          : "데이터 없음"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-500 font-black uppercase">커버 성공률</p>
                    <p className="text-lg font-black text-indigo-400">{matchData.tradeStats.coverRate}%</p>
                  </div>
                </div>
                
                <div className="bg-black/40 p-4 rounded-2xl border border-white/5 flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
                    <TrendingUp size={18} className="text-amber-500" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-black uppercase">순수 반응 속도 (Reaction)</p>
                    <p className="text-sm font-black text-white">
                      {matchData.tradeStats.reactionLatencyMs > 0 
                        ? (matchData.tradeStats.reactionLatencyMs / 1000).toFixed(2) + "초" 
                        : "데이터 없음"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI Analysis Section */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 ${isRanked ? 'bg-amber-500/20' : 'bg-indigo-500/20'} rounded-lg flex items-center justify-center`}>
                  <BarChart2 size={16} className={isRanked ? 'text-amber-500' : 'text-indigo-400'} />
                </div>
                <span className="text-white font-black">AI 전술 코칭</span>
              </div>
              
              <div className="flex gap-2 bg-black/40 p-1 rounded-xl border border-white/10">
                <button 
                  onClick={(e) => { e.stopPropagation(); setCoachingStyle("mild"); setAnalysis(null); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${coachingStyle === 'mild' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  다정한 맛
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setCoachingStyle("spicy"); setAnalysis(null); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${coachingStyle === 'spicy' ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  매운맛
                </button>
              </div>
            </div>

            {analysis ? (
              <div className="p-6 bg-black/40 rounded-3xl border border-white/10 animate-in fade-in zoom-in duration-500">
                {renderMarkdown(analysis)}
              </div>
            ) : (
              <button 
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className={`w-full py-10 ${isRanked ? 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10' : 'bg-indigo-500/5 border-indigo-500/20 hover:bg-indigo-500/10'} border-2 border-dashed rounded-3xl flex flex-col items-center gap-3 group transition-all`}
              >
                {isAnalyzing ? (
                  <div className={`w-6 h-6 border-2 border-white/10 ${isRanked ? 'border-t-amber-500' : 'border-t-indigo-500'} rounded-full animate-spin`} />
                ) : (
                  <MousePointer2 className={`${isRanked ? 'text-amber-500' : 'text-indigo-400'} group-hover:scale-110 transition-transform`} />
                )}
                <span className={`${isRanked ? 'text-amber-500' : 'text-indigo-400'} font-bold text-sm`}>
                  {isAnalyzing ? "전장 데이터를 복기하는 중..." : "이 매치 정밀 분석 시작하기"}
                </span>
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

const TacticalBox = ({ icon, label, value, subLabel, color, bgColor }: { icon: React.ReactNode, label: string, value: number | string, subLabel: string, color: string, bgColor: string }) => (
  <div className={`p-4 rounded-3xl border border-white/5 ${bgColor} flex flex-col gap-3 group hover:border-white/20 transition-all`}>
    <div className="flex items-center justify-between">
      <div className={`${color} group-hover:scale-110 transition-transform`}>{icon}</div>
      <span className="text-2xl font-black text-white">{value}</span>
    </div>
    <div>
      <p className="text-[11px] text-white font-black uppercase tracking-tight">{label}</p>
      <p className="text-[9px] text-gray-500 font-bold leading-tight mt-1">{subLabel}</p>
    </div>
  </div>
);
