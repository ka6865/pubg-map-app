"use client";

import React, { useState, useEffect } from "react";
import { Loader2, Flame, ShieldAlert, Award, ChevronDown } from "lucide-react";
import dynamic from "next/dynamic";

const Squad2DMap = dynamic(() => import("./Squad2DMap"), { ssr: false });

interface Teammate {
  name: string;
  role: string;
  roleDesc: string;
  avgDamage: number;
  avgKills: number;
  avgAssists: number;
  avgDbnos: number;
  totalDamage?: number;
  totalKills?: number;
  shares: {
    damage: number;
    kill: number;
    assist: number;
    dbno: number;
  };
}

interface MatchSummaryItem {
  matchId: string;
  mapName: string;
  mapDisplayName: string;
  winPlace: number;
  createdAt: string;
}

interface SquadAnalysisData {
  groupKey: string;
  matchCount: number;
  matchesSummary: MatchSummaryItem[];
  stats: {
    avgIsolation: number;
    avgTradeLatency: number;
    totalSmokeRescues: number;
    totalRevives: number;
    avgCoverRate: number;
    totalTeamWipes: number;
  };
  scores: {
    formation: number;
    backupSpeed: number;
    survivalCare: number;
    focusFire: number;
    teamWipe: number;
  };
  roleProfiles: Teammate[];
}

interface TeammateFeedback {
  name: string;
  praise: string;
  fault: string;
  advice: string;
}

interface AiFeedback {
  squadGrade: string;
  summary: string;
  strength: string;
  weakness: string;
  coaching: string;
  memberFeedbacks?: TeammateFeedback[];
  overallOpinion?: string;
}

interface SquadAnalysisPanelProps {
  nickname: string;
  platform: string;
}

export default function SquadAnalysisPanel({ nickname, platform }: SquadAnalysisPanelProps) {
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>("");
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [analysisData, setAnalysisData] = useState<SquadAnalysisData | null>(null);
  
  // AI Coaching States
  const [coachingStyle, setCoachingStyle] = useState<"spicy" | "mild">("spicy");
  const [loadingAi, setLoadingAi] = useState<boolean>(false);
  const [aiFeedback, setAiFeedback] = useState<AiFeedback | null>(null);

  // 2D Map Selected Match State
  const [selectedMapMatchId, setSelectedMapMatchId] = useState<string>("");

  // 1. Fetch detected squad list on mount
  useEffect(() => {
    async function fetchSquadGroups() {
      try {
        setLoadingList(true);
        const res = await fetch(`/api/pubg/squad-analyze?nickname=${encodeURIComponent(nickname)}&platform=${platform}`);
        const data = await res.json();
        
        if (data.groups && data.groups.length > 0) {
          setGroups(data.groups);
          setSelectedGroupKey(data.groups[0].groupKey);
        }
      } catch (err) {
        console.error("Failed to load squad list:", err);
      } finally {
        setLoadingList(false);
      }
    }
    fetchSquadGroups();
  }, [nickname, platform]);

  // 2. Fetch detailed analysis when selected group changes
  useEffect(() => {
    if (!selectedGroupKey) return;

    async function fetchSquadDetails() {
      try {
        setLoadingDetail(true);
        setAiFeedback(null); // Clear previous AI feedback
        const res = await fetch(
          `/api/pubg/squad-analyze?nickname=${encodeURIComponent(nickname)}&platform=${platform}&groupKey=${encodeURIComponent(selectedGroupKey)}`
        );
        const data = await res.json();
        if (data && !data.error) {
          setAnalysisData(data);
        }
      } catch (err) {
        console.error("Failed to load squad details:", err);
      } finally {
        setLoadingDetail(false);
      }
    }
    fetchSquadDetails();
  }, [selectedGroupKey, nickname, platform]);

  // Sync selected map match ID when analysisData loads
  useEffect(() => {
    if (analysisData?.matchesSummary && analysisData.matchesSummary.length > 0) {
      setSelectedMapMatchId(analysisData.matchesSummary[0].matchId);
    } else {
      setSelectedMapMatchId("");
    }
  }, [analysisData]);

  // 3. Request AI squad coaching
  const requestAiCoaching = async () => {
    if (!analysisData) return;

    try {
      setLoadingAi(true);
      const res = await fetch("/api/pubg/ai-squad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupKey: analysisData.groupKey,
          matchCount: analysisData.matchCount,
          stats: analysisData.stats,
          scores: analysisData.scores,
          roleProfiles: analysisData.roleProfiles,
          nickname,
          coachingStyle
        })
      });
      const data = await res.json();
      setAiFeedback(data);
    } catch (err) {
      console.error("AI coaching request failed:", err);
    } finally {
      setLoadingAi(false);
    }
  };

  // Helper to compute SVG polygon points for Radar Chart
  const getRadarPoints = (scores: SquadAnalysisData["scores"]) => {
    const metrics = [
      scores.formation,    // Top
      scores.backupSpeed,  // Right-Top
      scores.survivalCare, // Right-Bottom
      scores.focusFire,    // Left-Bottom
      scores.teamWipe      // Left-Top
    ];
    
    return metrics.map((score, i) => {
      const angle = (i * 72 - 90) * (Math.PI / 180);
      const radius = 80 * (score / 100);
      const x = 100 + radius * Math.cos(angle);
      const y = 100 + radius * Math.sin(angle);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  };

  if (loadingList) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        <span className="ml-2 text-zinc-400">스쿼드 그룹 목록을 감지하는 중...</span>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-zinc-600 mb-2" />
        <p className="text-zinc-400">최근 20경기 중 분석할 수 있는 스쿼드 모드 파티 게임 기록이 없습니다.</p>
        <p className="text-zinc-500 text-sm mt-1">솔로나 듀오 모드를 제외하고, 스쿼드 매치 데이터를 추가로 검색해 주세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Squad Selector Dropdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4 backdrop-blur-md">
        <div>
          <h3 className="font-semibold text-zinc-200">스쿼드 시너지 분석</h3>
          <p className="text-xs text-zinc-500">최근 20경기에서 감지된 고정 팀원 파티와의 전술 분석입니다.</p>
        </div>
        <div className="relative">
          <select
            value={selectedGroupKey}
            onChange={(e) => setSelectedGroupKey(e.target.value)}
            className="w-full sm:w-72 appearance-none rounded-lg border border-zinc-800 bg-zinc-955 px-4 py-2 pr-10 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            {groups.map((g) => (
              <option key={g.groupKey} value={g.groupKey}>
                {g.members.length + 1}인 파티 ({g.matchCount}경기) - {g.groupKey.slice(0, 30)}...
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-zinc-500 pointer-events-none" />
        </div>
      </div>

      {loadingDetail && (
        <div className="flex h-60 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          <span className="ml-2 text-zinc-400">선택된 스쿼드 시너지를 집계 분석 중...</span>
        </div>
      )}

      {analysisData && !loadingDetail && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Panel: Synergy Radar Chart & Stats Summary */}
          <div className="lg:col-span-5 rounded-xl border border-zinc-800/60 bg-zinc-900/20 p-5 space-y-6">
            <div className="text-center">
              <span className="text-xs font-semibold text-purple-400 tracking-wider uppercase">Synergy Radar</span>
              <h4 className="text-lg font-bold text-zinc-200 mt-1">협동 시너지 밸런스</h4>
            </div>

            {/* Radar Chart SVG */}
            <div className="relative flex justify-center">
              <svg width="220" height="220" viewBox="0 0 200 200" className="drop-shadow-lg">
                {/* Radial Grid lines (20, 40, 60, 80, 100%) */}
                {[0.2, 0.4, 0.6, 0.8, 1.0].map((scale, index) => {
                  const r = 80 * scale;
                  const pts = Array.from({ length: 5 }).map((_, i) => {
                    const angle = (i * 72 - 90) * (Math.PI / 180);
                    return `${(100 + r * Math.cos(angle)).toFixed(1)},${(100 + r * Math.sin(angle)).toFixed(1)}`;
                  }).join(" ");
                  return (
                    <polygon
                      key={index}
                      points={pts}
                      fill="none"
                      stroke="rgba(63, 63, 70, 0.35)"
                      strokeWidth="1"
                    />
                  );
                })}

                {/* Central axes */}
                {Array.from({ length: 5 }).map((_, i) => {
                  const angle = (i * 72 - 90) * (Math.PI / 180);
                  const x = 100 + 80 * Math.cos(angle);
                  const y = 100 + 80 * Math.sin(angle);
                  return (
                    <line
                      key={i}
                      x1="100"
                      y1="100"
                      x2={x}
                      y2={y}
                      stroke="rgba(63, 63, 70, 0.25)"
                      strokeWidth="1"
                    />
                  );
                })}

                {/* Plot Data Polygon */}
                <polygon
                  points={getRadarPoints(analysisData.scores)}
                  fill="rgba(168, 85, 247, 0.2)"
                  stroke="rgba(168, 85, 247, 0.85)"
                  strokeWidth="2"
                />

                {/* Data Points */}
                {Array.from({ length: 5 }).map((_, i) => {
                  const metrics = [
                    analysisData.scores.formation,
                    analysisData.scores.backupSpeed,
                    analysisData.scores.survivalCare,
                    analysisData.scores.focusFire,
                    analysisData.scores.teamWipe
                  ];
                  const angle = (i * 72 - 90) * (Math.PI / 180);
                  const radius = 80 * (metrics[i] / 100);
                  const x = 100 + radius * Math.cos(angle);
                  const y = 100 + radius * Math.sin(angle);
                  return (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r="3"
                      fill="#a855f7"
                      stroke="#18181b"
                      strokeWidth="1"
                    />
                  );
                })}
              </svg>
 
              {/* Dynamic Axis Labels */}
              <div className="absolute top-0 text-[10px] text-zinc-300 font-semibold">대열 유지 ({analysisData.scores.formation})</div>
              <div className="absolute right-0 top-1/3 text-[10px] text-zinc-300 font-semibold text-right">백업 속도 ({analysisData.scores.backupSpeed})</div>
              <div className="absolute right-8 bottom-4 text-[10px] text-zinc-300 font-semibold">생존 케어 ({analysisData.scores.survivalCare})</div>
              <div className="absolute left-8 bottom-4 text-[10px] text-zinc-300 font-semibold">화력 집중 ({analysisData.scores.focusFire})</div>
              <div className="absolute left-0 top-1/3 text-[10px] text-zinc-300 font-semibold text-left">전멸 기여 ({analysisData.scores.teamWipe})</div>
            </div>
 
            {/* Synergy metrics key-value list */}
            <div className="rounded-lg bg-zinc-950/60 p-3 space-y-2 text-xs border border-zinc-800/40">
              {(() => {
                const normalizedSearchName = nickname.toLowerCase().replace(/[^a-zA-Z0-9_]/g, "");
                const myProfile = analysisData.roleProfiles.find(
                  p => p.name.toLowerCase().replace(/[^a-zA-Z0-9_]/g, "") === normalizedSearchName
                );
                const squadAvgDamage = Math.round(
                  analysisData.roleProfiles.reduce((sum, p) => sum + p.avgDamage, 0) / Math.max(1, analysisData.roleProfiles.length)
                );
                const squadAvgKills = (
                  analysisData.roleProfiles.reduce((sum, p) => sum + p.avgKills, 0) / Math.max(1, analysisData.roleProfiles.length)
                ).toFixed(1);

                return (
                  <>
                    <div className="flex justify-between border-b border-zinc-900 pb-1.5 mb-1.5">
                      <span className="text-zinc-400 font-medium">내 평균 딜량 / 킬</span>
                      <span className="text-purple-300 font-bold">
                        {myProfile ? `${Math.round(myProfile.avgDamage)}딜 / ${myProfile.avgKills}킬` : "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-zinc-900 pb-1.5 mb-1.5">
                      <span className="text-zinc-400 font-medium">스쿼드 평균 딜량 / 킬</span>
                      <span className="text-zinc-100 font-bold">{squadAvgDamage}딜 / {squadAvgKills}킬</span>
                    </div>
                  </>
                );
              })()}
              <div className="flex justify-between">
                <span className="text-zinc-400">평균 대열 이탈율 (고립)</span>
                <span className={`font-bold ${analysisData.stats.avgIsolation > 3.5 ? "text-red-400" : "text-zinc-100"}`}>
                  {analysisData.stats.avgIsolation} (평균)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">평균 백업 반응 속도</span>
                <span className="text-zinc-100 font-bold">
                  {analysisData.stats.avgTradeLatency > 0
                    ? `${(analysisData.stats.avgTradeLatency / 1000).toFixed(2)}초`
                    : "측정 불가"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">누적 세이브 (연막/소생)</span>
                <span className="text-zinc-100 font-bold">{analysisData.stats.totalSmokeRescues}회 / {analysisData.stats.totalRevives}회</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">평균 아군 집중사격 커버율</span>
                <span className="text-zinc-100 font-bold">{Math.round(analysisData.stats.avgCoverRate * 100)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">적 스쿼드 전멸 유발 수</span>
                <span className="text-purple-300 font-bold">{analysisData.stats.totalTeamWipes}회 전멸</span>
              </div>
            </div>
          </div>
 
          {/* Right Panel: Squad Teammate Cards & Role Profiles */}
          <div className="lg:col-span-7 space-y-4">
            <h5 className="font-bold text-zinc-200 text-sm">스쿼드원 역할 분담 프로필</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysisData.roleProfiles.map((p) => (
                <div key={p.name} className="rounded-xl border border-zinc-800/50 bg-zinc-900/10 p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-bold text-zinc-100 text-sm block truncate w-32">{p.name}</span>
                      <div className="flex flex-col text-[10px] text-zinc-400 mt-0.5">
                        <span>평균 {Math.round(p.avgDamage)}딜 / {p.avgKills}킬</span>
                        {p.totalDamage !== undefined && p.totalKills !== undefined && (
                          <span className="text-zinc-500 font-medium">총 {Math.round(p.totalDamage)}딜 / {p.totalKills}킬 ({analysisData.matchCount}판 누적)</span>
                        )}
                      </div>
                    </div>
                    <span className="rounded bg-purple-500/15 border border-purple-500/20 px-2 py-0.5 text-xs text-purple-400 font-medium">
                      {p.role}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed min-h-[36px] font-medium">
                    {p.roleDesc}
                  </p>
                  
                  {/* Share Graphs */}
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between text-zinc-400">
                      <span>딜량 기여</span>
                      <span className="text-zinc-200 font-semibold">{p.shares.damage}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-purple-500" style={{ width: `${p.shares.damage}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
 
      {/* AI Coaching Section */}
      {analysisData && (
        <div className="rounded-xl border border-purple-500/10 bg-purple-950/5 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                <Flame className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-bold text-zinc-200">AI 스쿼드 분석 피드백</h4>
                <p className="text-xs text-zinc-400">현재 스쿼드 지표를 토대로 분석한 Gemini의 협동 보고서입니다.</p>
              </div>
            </div>
            
            {/* Tone Toggle & Request Button */}
            <div className="flex items-center gap-3">
              <div className="flex rounded-lg border border-zinc-800 bg-zinc-950 p-1">
                <button
                  onClick={() => setCoachingStyle("spicy")}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${coachingStyle === "spicy" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-zinc-250"}`}
                >
                  매운맛 (Spicy)
                </button>
                <button
                  onClick={() => setCoachingStyle("mild")}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${coachingStyle === "mild" ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-zinc-250"}`}
                >
                  다정한맛 (Mild)
                </button>
              </div>
              
              <button
                onClick={requestAiCoaching}
                disabled={loadingAi}
                className="flex items-center justify-center rounded-lg bg-purple-600 hover:bg-purple-700 px-4 py-2 text-xs font-semibold text-white transition-all disabled:opacity-50"
              >
                {loadingAi ? (
                  <>
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    분석 중...
                  </>
                ) : "AI 코칭 보고서 생성"}
              </button>
            </div>
          </div>
 
          {/* AI Result View */}
          {aiFeedback && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-4 border-t border-purple-500/10">
              
              {/* Grade Shield */}
              <div className="md:col-span-3 flex flex-col items-center justify-center text-center p-5 rounded-2xl bg-purple-950/15 border border-purple-500/10 h-fit w-full min-w-0 md:min-w-[180px] shrink-0">
                <span className="text-xs text-purple-400 font-bold tracking-wide">Squad Grade</span>
                <div className="relative flex items-center justify-center h-20 w-20 my-3">
                  <Award className="h-16 w-16 text-purple-500" />
                  <span className="absolute text-xl font-black text-white">{aiFeedback.squadGrade}</span>
                </div>
                <p className="text-xs text-zinc-200 font-semibold max-w-[200px] break-keep text-center leading-relaxed">{aiFeedback.summary}</p>
              </div>
 
              {/* Detail Content */}
              <div className="md:col-span-9 w-full min-w-0 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-lg bg-zinc-950/40 p-4 border border-zinc-800/40">
                    <h5 className="text-xs font-bold text-green-400 mb-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                      스쿼드 협동 강점
                    </h5>
                    <p className="text-xs text-zinc-200 leading-relaxed font-medium">{aiFeedback.strength}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-950/40 p-4 border border-zinc-800/40">
                    <h5 className="text-xs font-bold text-red-400 mb-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                      스쿼드 취약점
                    </h5>
                    <p className="text-xs text-zinc-200 leading-relaxed font-medium">{aiFeedback.weakness}</p>
                  </div>
                </div>
 
                <div className="rounded-lg bg-purple-950/10 p-4 border border-purple-500/10">
                  <h5 className="text-xs font-bold text-purple-300 mb-1">💡 전술적 개선 코칭 제안</h5>
                  <p className="text-xs text-zinc-100 leading-relaxed font-medium">{aiFeedback.coaching}</p>
                </div>
              </div>

              {/* 팀원 개별 피드백 */}
              {aiFeedback.memberFeedbacks && aiFeedback.memberFeedbacks.length > 0 && (
                <div className="col-span-12 border-t border-purple-500/10 pt-6 space-y-4">
                  <h5 className="font-bold text-zinc-200 text-xs flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                    👥 팀원 개별 AI 평가 및 피드백
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {aiFeedback.memberFeedbacks.map((member: any) => (
                      <div key={member.name} className="rounded-xl border border-zinc-800/50 bg-zinc-950/40 p-4 space-y-3.5 shadow-sm">
                        <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
                          <span className="font-bold text-purple-300 text-xs">{member.name}</span>
                          <span className="text-[9px] bg-purple-500/15 border border-purple-500/20 text-purple-400 font-black px-2 py-0.5 rounded uppercase tracking-wider">Teammate</span>
                        </div>
                        
                        <div className="space-y-2.5">
                          {/* 칭찬할 점 */}
                          <div className="text-[11px] leading-relaxed">
                            <div className="font-bold text-green-400 flex items-center gap-1 mb-0.5">👍 칭찬할 점</div>
                            <p className="text-zinc-300 pl-1 font-medium">{member.praise}</p>
                          </div>
                          
                          {/* 못한 점 */}
                          <div className="text-[11px] leading-relaxed">
                            <div className="font-bold text-red-400 flex items-center gap-1 mb-0.5">👎 못한 점</div>
                            <p className="text-zinc-300 pl-1 font-medium">{member.fault}</p>
                          </div>
                          
                          {/* 피드백 */}
                          <div className="text-[11px] leading-relaxed">
                            <div className="font-bold text-purple-400 flex items-center gap-1 mb-0.5">💡 개인 피드백</div>
                            <p className="text-zinc-300 pl-1 font-medium">{member.advice}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 팀 전체 총평 */}
              {aiFeedback.overallOpinion && (
                <div className="col-span-12 border-t border-purple-500/10 pt-4">
                  <div className="rounded-xl bg-gradient-to-r from-purple-950/20 to-zinc-950/60 p-5 border border-purple-500/15 shadow-md">
                    <h5 className="text-xs font-bold text-purple-300 mb-2 flex items-center gap-2">
                      <Flame className="h-4 w-4 text-purple-400 fill-purple-400/20" />
                      📢 팀 전체 총평 (AI 코치의 한마디)
                    </h5>
                    <p className="text-xs text-zinc-200 leading-relaxed font-semibold">{aiFeedback.overallOpinion}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2D Map Trajectory Section (V3.1) */}
      {analysisData && analysisData.matchesSummary && analysisData.matchesSummary.length > 0 && (
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/10 p-5 space-y-4">
          <div>
            <h4 className="font-bold text-zinc-200">교전 동선 2D 맵 피드백</h4>
            <p className="text-xs text-zinc-400">아군 최초 기절 당시의 대열 배치를 2D 지도로 분석합니다. 경기 칩을 선택해 다른 매치를 확인해 보세요.</p>
          </div>

          {/* Match Selector Chips (Scrollable on Mobile) */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0">
            {analysisData.matchesSummary.map((m) => (
              <button
                key={m.matchId}
                onClick={() => setSelectedMapMatchId(m.matchId)}
                className={`inline-block rounded-full px-4 py-1.5 text-xs font-bold transition-all border cursor-pointer ${
                  selectedMapMatchId === m.matchId
                    ? "bg-purple-600 border-purple-500 text-white shadow-md shadow-purple-500/10"
                    : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {m.mapDisplayName} ({m.winPlace}등)
              </button>
            ))}
          </div>

          {/* 2D Map Component */}
          {selectedMapMatchId && (
            <Squad2DMap
              key={selectedMapMatchId}
              matchId={selectedMapMatchId}
              nickname={nickname}
              platform={platform}
              mapName={analysisData.matchesSummary.find((m) => m.matchId === selectedMapMatchId)?.mapName || "Baltic_Main"}
            />
          )}
        </div>
      )}
    </div>
  );
}