"use client";

import React, { useState, useTransition, useRef, useEffect } from "react";
import { getTierIconPath } from "@/utils/tier";
import {
  Trophy,
  Swords,
  Shield,
  Clock,
  Users,
  HelpCircle,
  X,
  TrendingUp,
} from "lucide-react";

// ─── Stat helpers ───────────────────────────────────────────────────────────
const getKDA = (k: number, a: number, d: number) =>
  ((k + a) / (d || 1)).toFixed(2);
const getWinRate = (w: number, p: number) =>
  p > 0 ? ((w / p) * 100).toFixed(1) : "0.0";
const getAvgDmg = (dmg: number, p: number) =>
  p > 0 ? (dmg / p).toFixed(0) : "0";
const getAvgKnockouts = (dbno: number, p: number) =>
  p > 0 ? (dbno / p).toFixed(1) : "0.0";
const getSurvivalTime = (time: number, p: number) => {
  if (p === 0) return "0분 0초";
  const avgSec = Math.floor(time / p);
  return `${Math.floor(avgSec / 60)}분 ${avgSec % 60}초`;
};
const getTop10 = (data: any, isRanked: boolean) =>
  isRanked
    ? (data.top10Ratio * 100).toFixed(1)
    : getWinRate(data.top10s, data.roundsPlayed);

// ─── Types ───────────────────────────────────────────────────────────────────
type Mode = "ranked" | "normal";
type GameType = "duo" | "squad" | "solo";

interface StatSummaryPanelProps {
  stats: {
    ranked?: { solo?: any; duo?: any; squad?: any };
    normal?: { solo?: any; duo?: any; squad?: any };
  };
  isMobile: boolean;
}

// ─── Tier styling helper ─────────────────────────────────────────────────────
const TIER_STYLE: Record<string, { color: string; glow: string; bg: string }> =
  {
    Master: {
      color: "text-purple-300",
      glow: "shadow-[0_0_20px_rgba(168,85,247,0.4)]",
      bg: "from-purple-500/20 to-purple-500/5",
    },
    Diamond: {
      color: "text-cyan-300",
      glow: "shadow-[0_0_20px_rgba(34,211,238,0.4)]",
      bg: "from-cyan-500/20 to-cyan-500/5",
    },
    Platinum: {
      color: "text-teal-300",
      glow: "shadow-[0_0_20px_rgba(20,184,166,0.35)]",
      bg: "from-teal-500/20 to-teal-500/5",
    },
    Gold: {
      color: "text-amber-300",
      glow: "shadow-[0_0_20px_rgba(245,158,11,0.4)]",
      bg: "from-amber-500/20 to-amber-500/5",
    },
    Silver: {
      color: "text-slate-300",
      glow: "shadow-[0_0_20px_rgba(148,163,184,0.3)]",
      bg: "from-slate-500/20 to-slate-500/5",
    },
    Bronze: {
      color: "text-orange-400",
      glow: "shadow-[0_0_20px_rgba(251,146,60,0.3)]",
      bg: "from-orange-600/20 to-orange-600/5",
    },
  };

const getTierStyle = (tier?: string) => {
  if (!tier) return TIER_STYLE.Bronze;
  for (const key of Object.keys(TIER_STYLE)) {
    if (tier.includes(key)) return TIER_STYLE[key];
  }
  return TIER_STYLE.Bronze;
};

// ─── Empty state ─────────────────────────────────────────────────────────────
const EmptyState = ({ label }: { label: string }) => (
  <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
    <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center">
      <Shield size={26} className="text-white/15" />
    </div>
    <p className="text-white/25 font-black text-sm tracking-tight">
      {label} 기록 없음
    </p>
    <p className="text-white/15 text-xs font-medium">
      해당 시즌에 플레이한 기록이 없습니다.
    </p>
  </div>
);

// ─── Stat badge cell ─────────────────────────────────────────────────────────
const StatCell = ({
  label,
  value,
  accent = false,
  dim = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  dim?: boolean;
}) => (
  <div className="flex flex-col items-center gap-1 min-w-0">
    <span
      className={`text-lg md:text-2xl font-black tracking-tighter leading-none ${
        accent ? "text-amber-400" : dim ? "text-white/50" : "text-white"
      }`}
    >
      {value}
    </span>
    <span className="text-[9px] md:text-[10px] font-black text-white/25 uppercase tracking-wider whitespace-nowrap">
      {label}
    </span>
  </div>
);

// ─── Main panel ──────────────────────────────────────────────────────────────
export const StatSummaryPanel = ({ stats, isMobile }: StatSummaryPanelProps) => {
  const [mode, setMode] = useState<Mode>("ranked");
  const [gameType, setGameType] = useState<GameType>("squad");
  const [, startTransition] = useTransition();
  const [showDbnoTooltip, setShowDbnoTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const handleModeChange = (newMode: Mode) => {
    startTransition(() => {
      setMode(newMode);
    });
  };

  const handleTypeChange = (newType: GameType) => {
    startTransition(() => setGameType(newType));
  };

  // 바깥 클릭 시 툴팁 닫기
  useEffect(() => {
    if (!showDbnoTooltip || !isMobile) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setShowDbnoTooltip(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDbnoTooltip, isMobile]);

  const isRanked = mode === "ranked";
  const data = isRanked
    ? stats?.ranked?.[gameType]
    : stats?.normal?.[gameType];

  const hasData = data && data.roundsPlayed > 0;
  const tierInfo = hasData ? getTierStyle(data?.currentTier?.tier) : null;

  // 서브탭 목록
  const subTabs: { key: GameType; label: string }[] = [
    { key: "solo", label: "솔로" },
    { key: "duo", label: "듀오" },
    { key: "squad", label: "스쿼드" },
  ];

  return (
    <div className="w-full bg-black/60 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
      {/* ── 상단 모드 탭 (경쟁전 / 일반전) ── */}
      <div className="flex border-b border-white/8">
        {(
          [
            { key: "ranked" as Mode, icon: Trophy, label: "경쟁전" },
            { key: "normal" as Mode, icon: Shield, label: "일반전" },
          ] as const
        ).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => handleModeChange(key)}
            className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-black transition-all duration-200 relative ${
              mode === key
                ? key === "ranked"
                  ? "text-amber-400"
                  : "text-indigo-400"
                : "text-white/25 hover:text-white/50"
            }`}
          >
            <Icon size={15} />
            <span>{label}</span>
            {/* 선택 언더라인 */}
            {mode === key && (
              <span
                className={`absolute bottom-0 left-4 right-4 h-[2px] rounded-full ${
                  key === "ranked"
                    ? "bg-amber-500"
                    : "bg-indigo-500"
                }`}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── 서브탭 (솔로 / 듀오 / 스쿼드) ── */}
      <div
        className={`flex items-center gap-2 px-5 py-3 border-b border-white/5 ${
          isRanked ? "bg-amber-500/3" : "bg-indigo-500/3"
        }`}
      >
        {subTabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleTypeChange(key)}
            className={`px-4 py-1.5 rounded-full text-xs font-black transition-all duration-200 ${
              gameType === key
                ? isRanked
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                  : "bg-indigo-500/20 text-indigo-400 border border-indigo-500/40"
                : "text-white/30 hover:text-white/60 border border-transparent hover:border-white/10"
            }`}
          >
            {label}
          </button>
        ))}

        {/* 게임 수 뱃지 */}
        {hasData && (
          <span className="ml-auto text-[10px] font-black text-white/20 tracking-widest">
            총 {data.roundsPlayed}게임
          </span>
        )}
      </div>

      {/* ── 콘텐츠 영역 ── */}
      <div className="p-5 md:p-7">
        {!hasData ? (
          <EmptyState label={`${isRanked ? "경쟁전" : "일반전"} ${gameType === "solo" ? "솔로" : gameType === "duo" ? "듀오" : "스쿼드"}`} />
        ) : (
          <div className="flex flex-col gap-5">
            {/* 랭크 배지 (경쟁전만) */}
            {isRanked && (
              <div
                className={`flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r ${tierInfo?.bg} border border-white/8 ${tierInfo?.glow}`}
              >
                <img
                  src={getTierIconPath(data.currentTier?.tier, data.currentTier?.subTier)}
                  alt={data.currentTier?.tier || "Rank Icon"}
                  className="w-12 h-12 md:w-16 md:h-16 object-contain shrink-0"
                />
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">
                    현재 랭크
                  </span>
                  <span
                    className={`text-2xl md:text-3xl font-black tracking-tight leading-none ${tierInfo?.color}`}
                  >
                    {data.currentTier?.tier || "랭크 정보 없음"}
                  </span>
                  {data.currentTier?.subTier && (
                    <span className="text-[11px] text-white/40 font-bold">
                      {data.currentTier.subTier} 티어
                    </span>
                  )}
                </div>
                {data.currentRankPoint > 0 && (
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-[10px] font-black text-white/25 uppercase tracking-widest">
                      랭크 포인트
                    </span>
                    <span className={`text-2xl font-black ${tierInfo?.color}`}>
                      {data.currentRankPoint}
                      <span className="text-xs text-white/30 ml-1 font-bold">RP</span>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* 핵심 스탯 배지 행 */}
            <div className="grid grid-cols-5 gap-2 md:gap-4 py-4 px-3 bg-white/[0.03] rounded-2xl border border-white/5">
              <StatCell label="KDA" value={getKDA(data.kills, data.assists, data.deaths || data.losses)} accent />
              <StatCell label="승률" value={`${getWinRate(data.wins, data.roundsPlayed)}%`} />
              <StatCell label="Top 10" value={`${getTop10(data, isRanked)}%`} />
              <StatCell label="평균 딜량" value={getAvgDmg(data.damageDealt, data.roundsPlayed)} />
              {/* DBNO 셀 + 툴팁 */}
              <div className="flex flex-col items-center gap-1 min-w-0 relative" ref={tooltipRef}>
                <div className="flex items-center gap-1">
                  <span className="text-lg md:text-2xl font-black tracking-tighter leading-none text-green-400">
                    {getAvgKnockouts(data.dBNOs, data.roundsPlayed)}
                  </span>
                  <button
                    onMouseEnter={() => !isMobile && setShowDbnoTooltip(true)}
                    onMouseLeave={() => !isMobile && setShowDbnoTooltip(false)}
                    onClick={() => isMobile && setShowDbnoTooltip(!showDbnoTooltip)}
                    className="text-white/20 hover:text-amber-400 transition-colors"
                  >
                    <HelpCircle size={9} />
                  </button>
                </div>
                <span className="text-[9px] md:text-[10px] font-black text-white/25 uppercase tracking-wider whitespace-nowrap">
                  DBNO
                </span>
                {showDbnoTooltip && (
                  <div
                    className={`absolute z-50 p-3 bg-black/95 border border-amber-500/30 rounded-xl text-[10px] text-white/80 font-bold shadow-2xl w-44 animate-in fade-in zoom-in-95 ${
                      isMobile ? "bottom-full mb-2 right-0" : "bottom-full mb-2 left-1/2 -translate-x-1/2"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-amber-400 font-black uppercase text-[9px]">DBNO</span>
                      {isMobile && (
                        <button onClick={() => setShowDbnoTooltip(false)}>
                          <X size={10} className="text-white/40" />
                        </button>
                      )}
                    </div>
                    Down But Not Out: 게임당 적을 기절시킨 평균 횟수입니다.
                  </div>
                )}
              </div>
            </div>

            {/* 보조 스탯 행 */}
            <div className="flex items-center gap-3 md:gap-6 px-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Trophy size={12} className="text-amber-500/60" />
                <span className="text-xs font-black text-white/40">우승</span>
                <span className="text-sm font-black text-amber-400">
                  {data.wins}회
                </span>
              </div>
              <div className="w-px h-3 bg-white/10 hidden md:block" />
              {isRanked ? (
                <div className="flex items-center gap-2">
                  <Users size={12} className="text-white/30" />
                  <span className="text-xs font-black text-white/40">어시스트</span>
                  <span className="text-sm font-black text-white/60">
                    {data.assists}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Swords size={12} className="text-white/30" />
                  <span className="text-xs font-black text-white/40">최다 킬</span>
                  <span className="text-sm font-black text-white/60">
                    {data.roundMostKills}
                  </span>
                </div>
              )}
              {!isRanked && (
                <>
                  <div className="w-px h-3 bg-white/10 hidden md:block" />
                  <div className="flex items-center gap-2">
                    <Clock size={12} className="text-white/30" />
                    <span className="text-xs font-black text-white/40">평균 생존</span>
                    <span className="text-xs font-black text-white/50">
                      {getSurvivalTime(data.timeSurvived, data.roundsPlayed)}
                    </span>
                  </div>
                </>
              )}
              <div className="ml-auto flex items-center gap-2">
                <TrendingUp size={12} className="text-white/20" />
                <span className="text-[10px] font-black text-white/20">
                  헤드샷{" "}
                  {data.kills > 0
                    ? ((data.headshotKills / data.kills) * 100).toFixed(1)
                    : "0.0"}
                  %
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 하단 액센트 바 */}
      <div
        className={`h-[3px] w-full bg-gradient-to-r ${
          isRanked
            ? "from-amber-600 via-amber-500/40 to-transparent"
            : "from-indigo-600 via-indigo-500/40 to-transparent"
        }`}
      />
    </div>
  );
};
