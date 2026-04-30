"use client";

import React, { useState } from "react";
import { ShieldAlert, Clock, TrendingUp, Flame, Wind, Heart, Skull, Target } from "lucide-react";
import { IsolationRadar } from "./IsolationRadar";
import { SpiderChart } from "./SpiderChart";
import { useEffect, useRef } from "react";

interface DebateStat {
  label: string;
  value: string;
}

interface DebateIssue {
  topic: string;
  question: string;
  kindOpinion: string;
  spicyOpinion: string;
  winner: "kind" | "spicy" | "draw";
  userStats: DebateStat[];
  benchmarkStats: DebateStat[];
}

interface ActionItem {
  icon: string;
  title: string;
  desc: string;
}

interface DebateData {
  debateIssues: DebateIssue[];
  finalVerdict: string;
  actionItems: ActionItem[];
  signature?: string;
  signatureSub?: string;
  visuals?: {
    latency: { counter: string; opportunity: string };
    counterLatency: string;
    latestMatchTime?: string;
    reactionLatency: string;
    initiativeSuccess: string;
    coverRate: string;
    goldenTime?: { early: number; mid1: number; mid2: number; late: number };
    killContrib?: { solo: number; cleanup: number };
    bluezoneWaste?: number;
    modeDistribution?: {
      ranked: number;
      normal: number;
      main: string;
    };
    tactical?: {
      suppRate: string;
      smokeRate: string;
      reviveRate: string;
      baitCount: number;
      suppRaw?: { count: number; total: number };
      smokeRaw?: { count: number; total: number; teamCover?: number };
      reviveRaw?: { count: number; total: number };
      isolation?: {
        isolationIndex: number;
        minDist: number;
        heightDiff: number;
        isCrossfire: boolean;
        teammateCount: number;
      };
    };
  };
}

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

export const RecentAISummary = ({ matchIds, nickname, platform }: { matchIds: string[]; nickname: string; platform: string }) => {
  const [debateData, setDebateData] = useState<DebateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openIssueIdx, setOpenIssueIdx] = useState<number | null>(null);
  
  const textBufferRef = useRef("");
  const lineBufferRef = useRef("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleFetchSummary = async () => {
    if (loading || debateData) return;
    setLoading(true);
    setError(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    try {
      const response = await fetch('/api/pubg/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({ 
          matchIds: matchIds, 
          nickname, 
          platform: platform 
        })
      });

      if (!response.ok) throw new Error("분석 중 오류가 발생했습니다.");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      // [V6.2] Throttled UI Update 설정 (100ms 주기)
      const updateInterval = setInterval(() => {
        setStreamingText(textBufferRef.current);
      }, 100);

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            lineBufferRef.current += chunk;

            const lines = lineBufferRef.current.split("\n");
            lineBufferRef.current = lines.pop() || ""; // 마지막 미완성 라인은 버퍼에 유지

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const parsed = JSON.parse(line);
                if (parsed.type === "visuals") {
                  setDebateData(prev => ({ ...prev, visuals: parsed.data } as any));
                  setLoading(false);
                } else if (parsed.type === "chunk") {
                  textBufferRef.current += parsed.data;
                  fullText += parsed.data;
                } else if (parsed.type === "done") {
                  try {
                    // [V6.26] AI 응답 정제: 순수 JSON 블록만 추출 ({ ... })
                    let cleanJson = fullText.trim();
                    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                      cleanJson = jsonMatch[0];
                    }
                    
                    const finalJson = JSON.parse(cleanJson);
                    setDebateData(prev => ({ ...finalJson, visuals: prev?.visuals || finalJson.visuals }));
                  } catch (e) {
                    console.warn("Final JSON parse failed. FullText Sample:", fullText.substring(0, 100));
                  }
                }
              } catch (e) {
                console.error("NDJSON Parse Error:", e, line);
              }
            }
          }
        } finally {
          clearInterval(updateInterval);
          setStreamingText(textBufferRef.current); // 마지막 텍스트 동기화
        }
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getScore = () => {
    if (!debateData?.debateIssues) return { kind: 0, spicy: 0, draw: 0 };
    const scoreMap = { kind: 0, spicy: 0, draw: 0 };
    debateData.debateIssues.forEach(issue => {
      scoreMap[issue.winner as keyof typeof scoreMap]++;
    });
    return scoreMap;
  };

  const score = getScore();
  
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  if (error) {
    return (
      <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-2xl text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <button onClick={() => { setError(null); setDebateData(null); }} className="text-indigo-400 underline">재시도</button>
      </div>
    );
  }

  if (!debateData && !loading) {
    return (
      <button
        onClick={handleFetchSummary}
        className="w-full p-8 bg-indigo-500/5 border-2 border-dashed border-indigo-500/30 rounded-3xl text-indigo-400 font-bold flex flex-col items-center gap-4 hover:bg-indigo-500/10 transition-all active:scale-[0.98]"
      >
        <span className="text-4xl">🔥</span>
        <span>최근 10경기 AI 끝장 토론 시작</span>
      </button>
    );
  }

  if (loading) {
    return (
      <div className="p-12 bg-white/5 rounded-3xl border border-white/10 text-center">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-6" />
        <p className="text-gray-400 animate-pulse text-sm">AI 분석 엔진이 데이터 정합성을 체크 중입니다...</p>
      </div>
    );
  }

  const parseRate = (s: string | undefined) => {
    if (!s) return 0;
    const n = parseInt(s);
    return isNaN(n) ? 0 : n;
  };

  return (
    <div className="@container flex flex-col gap-8 animate-in fade-in duration-700">
      <div className="flex justify-end">
        <button 
          onClick={() => { setDebateData(null); textBufferRef.current = ""; handleFetchSummary(); }}
          className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] text-gray-400 font-black uppercase tracking-widest transition-all"
        >
          🔄 분석 데이터 갱신
        </button>
      </div>
      {/* [V6.2] 공간 분석 레이더 및 CLS 방지 Skeleton */}
      {(debateData?.visuals?.tactical?.isolation || (loading && !debateData)) && (
        <div className="min-h-[380px] w-full">
          {debateData?.visuals?.tactical?.isolation ? (
            <IsolationRadar data={debateData?.visuals?.tactical?.isolation} loading={loading} />
          ) : (
            <div className="w-full h-[380px] bg-white/5 rounded-[32px] border border-white/10 flex flex-col items-center justify-center gap-4 animate-pulse">
              <div className="w-20 h-20 border-4 border-emerald-500/10 border-t-emerald-500/40 rounded-full animate-spin" />
              <div className="h-4 w-48 bg-white/10 rounded-full" />
            </div>
          )}
        </div>
      )}


      {/* 스트리밍 중인 텍스트 노출 (차트와 카드 사이) */}
      {!debateData?.debateIssues && streamingText && (
        <div className="p-8 bg-white/5 border border-white/10 rounded-[32px] animate-in fade-in duration-500">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
            <span className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">AI 전술 데스크 실시간 분석 중</span>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed font-medium font-mono">
            {streamingText.substring(0, 300)}...
          </p>
        </div>
      )}

      {/* [V2.1] LOL PS 스타일 레이더 차트 */}
      {debateData && (
        <SpiderChart 
          nickname={nickname}
          data={{
            combat: Math.min(100, (parseRate(debateData?.visuals?.initiativeSuccess || "0%") * 0.8) + (debateData?.visuals?.killContrib?.solo || 0) * 5),
            survival: Math.min(100, (parseRate(String(debateData?.visuals?.goldenTime?.late || "0")) / 10) + 50),
            growth: 75,
            vision: 60,
            teamwork: Math.min(100, 
              debateData?.visuals?.tactical 
                ? (parseRate(debateData.visuals.tactical.suppRate) + parseRate(debateData.visuals.tactical.smokeRate) + parseRate(debateData.visuals.tactical.reviveRate)) / 3 + 40
                : (debateData?.visuals?.counterLatency !== "N/A" ? 85 : 40)
            ),
          }}
        />
      )}

      <div className="flex justify-around items-center p-6 bg-black/40 rounded-3xl border border-white/10 backdrop-blur-md shadow-2xl">
        <div className="text-center group">
          <div className="text-3xl font-black text-green-400 mb-1">{score.kind}</div>
          <div className="text-[10px] text-green-400/60 font-bold uppercase tracking-wider group-hover:scale-110 transition-transform">😊 착한맛 승</div>
        </div>
        <div className="h-12 w-px bg-white/10" />
        <div className="text-center group">
          <div className="text-3xl font-black text-red-400 mb-1">{score.spicy}</div>
          <div className="text-[10px] text-red-400/60 font-bold uppercase tracking-wider group-hover:scale-110 transition-transform">⚡ 매운맛 승</div>
        </div>
        <div className="h-12 w-px bg-white/10" />
        <div className="text-center group">
          <div className="text-3xl font-black text-yellow-400 mb-1">{score.draw}</div>
          <div className="text-[10px] text-yellow-400/60 font-bold uppercase tracking-wider group-hover:scale-110 transition-transform">🤝 무승부</div>
        </div>
      </div>

      {debateData?.signature && (
        <div className="p-8 bg-gradient-to-r from-yellow-500/20 via-yellow-500/5 to-transparent border-l-4 border-yellow-500 rounded-r-[32px] animate-in fade-in slide-in-from-left duration-1000 shadow-2xl shadow-yellow-500/5">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-yellow-500 rounded-[20px] flex items-center justify-center text-3xl shadow-[0_0_30px_rgba(234,179,8,0.5)] animate-pulse">
              🏆
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-amber-500 font-black uppercase tracking-[0.2em] mb-1">시그니처 플레이 분석</span>
              <h2 className="text-xl md:text-2xl text-white font-black tracking-tight mb-1">{debateData?.signature || "데이터 분석 중..."}</h2>
              <p className="text-[11px] text-gray-500 font-bold leading-relaxed">{debateData?.signatureSub || "데이터 분석을 통한 플레이 스타일 정의"}</p>
            </div>
          </div>
        </div>
      )}

      {debateData?.visuals?.goldenTime && (
        <div className="p-10 bg-black/80 rounded-[40px] border border-white/10 backdrop-blur-2xl shadow-2xl overflow-hidden relative">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-yellow-500/10 blur-[80px] rounded-full" />
          
          <div className="flex items-center justify-between mb-10 relative z-10">
            <div className="flex flex-col gap-2">
              <div className="text-[12px] text-yellow-400 font-black uppercase tracking-[0.3em] flex items-center gap-2">
                <span className="text-lg">🔥</span> Golden Time Analysis
              </div>
              <div className="text-xl font-black text-white">생존 구간별 화력 집중도</div>
            </div>
            {debateData.visuals.bluezoneWaste !== undefined && debateData.visuals.bluezoneWaste > 0 && (
              <div className="px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-2xl text-[12px] text-red-400 font-black flex items-center gap-3 shadow-lg shadow-red-500/10">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                자기장 손실: {debateData?.visuals?.bluezoneWaste || 0}회
              </div>
            )}
          </div>

          <div className="space-y-12 relative z-10">
            <div className="relative pt-6 md:pt-12">
              <div className="grid grid-cols-4 gap-2 md:gap-6 h-40 md:h-48 items-end relative">
                {[
                  { label: "0-5분", val: debateData?.visuals?.goldenTime?.early || 0, color: "from-blue-400 to-blue-600", desc: "초반교전" },
                  { label: "5-15분", val: debateData?.visuals?.goldenTime?.mid1 || 0, color: "from-indigo-400 to-indigo-600", desc: "중반대치" },
                  { label: "15-25분", val: debateData?.visuals?.goldenTime?.mid2 || 0, color: "from-purple-400 to-purple-600", desc: "후반운영" },
                  { label: "25분+", val: debateData?.visuals?.goldenTime?.late || 0, color: "from-pink-400 to-pink-600", desc: "엔딩싸움" },
                ].map((item, idx) => {
                  const maxVal = Math.max(
                    debateData.visuals?.goldenTime?.early || 0,
                    debateData.visuals?.goldenTime?.mid1 || 0,
                    debateData.visuals?.goldenTime?.mid2 || 0,
                    debateData.visuals?.goldenTime?.late || 0,
                    1
                  );
                  const barHeight = Math.max(5, (item.val / maxVal) * 100);
                  return (
                    <div key={idx} className="flex flex-col items-center gap-3 md:gap-5 group cursor-default h-full">
                      <div className="relative w-full flex-1 flex items-end justify-center bg-white/10 rounded-xl md:rounded-2xl overflow-hidden border border-white/10 shadow-inner">
                        <div className="absolute top-2 md:top-4 inset-x-0 text-center z-20">
                          <div className="text-[10px] md:text-[14px] font-black text-white drop-shadow-md group-hover:scale-110 transition-transform">
                            {Math.round(item.val).toLocaleString()}
                          </div>
                          <div className="text-[7px] md:text-[9px] font-black text-white/40 uppercase">DMG</div>
                        </div>
                        <div 
                          className={`w-full bg-gradient-to-t ${item.color} transition-all duration-1000 ease-out shadow-[0_-4px_20px_rgba(0,0,0,0.5)] relative z-10`} 
                          style={{ height: `${barHeight}%` }}
                        >
                          <div className="absolute top-0 left-0 right-0 h-0.5 md:h-1 bg-white/30" />
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-0.5 md:gap-1">
                        <div className="text-[10px] md:text-[14px] text-white font-black tracking-tighter md:tracking-tight whitespace-nowrap">{item.label}</div>
                        <div className="text-[8px] md:text-[10px] text-white/40 font-black uppercase tracking-tighter whitespace-nowrap">{item.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 pt-10 border-t border-white/10">
              <div className="flex flex-col gap-4 md:gap-5">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] md:text-[13px] text-white/50 font-black tracking-widest uppercase">솔로 교전력</div>
                  <div className="px-3 py-1 bg-yellow-400/10 rounded-lg text-[13px] md:text-[14px] text-yellow-400 font-black tracking-tighter">
                    {debateData?.visuals?.killContrib?.solo || 0} / {(debateData?.visuals?.killContrib?.solo || 0) + (debateData?.visuals?.killContrib?.cleanup || 0)} 킬
                  </div>
                </div>
                <div className="h-4 bg-white/5 rounded-full overflow-hidden p-1 border border-white/5">
                  <div 
                    className="h-full bg-gradient-to-r from-yellow-500 to-yellow-300 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(234,179,8,0.4)]" 
                    style={{ 
                      width: `${(() => {
                        const solo = debateData?.visuals?.killContrib?.solo || 0;
                        const cleanup = debateData?.visuals?.killContrib?.cleanup || 0;
                        const total = solo + cleanup;
                        return total > 0 ? (solo / total) * 100 : 0;
                      })()}%` 
                    }} 
                  />
                </div>
                <div className="text-[10px] md:text-[11px] text-white/40 font-bold leading-relaxed">
                  내 딜 비중 70% 이상의 <span className="text-white/70">순수 무력 솔로 킬</span>
                </div>
              </div>

              <div className="flex flex-col gap-4 md:gap-5">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] md:text-[13px] text-white/50 font-black tracking-widest uppercase">팀 백업 마무리</div>
                  <div className="px-3 py-1 bg-green-400/10 rounded-lg text-[13px] md:text-[14px] text-green-400 font-black tracking-tighter">
                    {debateData?.visuals?.killContrib?.cleanup || 0} / {(debateData?.visuals?.killContrib?.solo || 0) + (debateData?.visuals?.killContrib?.cleanup || 0)} 킬
                  </div>
                </div>
                <div className="h-4 bg-white/5 rounded-full overflow-hidden p-1 border border-white/5">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 to-green-300 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(34,197,94,0.4)]" 
                    style={{ 
                      width: `${(() => {
                        const solo = debateData?.visuals?.killContrib?.solo || 0;
                        const cleanup = debateData?.visuals?.killContrib?.cleanup || 0;
                        const total = solo + cleanup;
                        return total > 0 ? (cleanup / total) * 100 : 0;
                      })()}%` 
                    }} 
                  />
                </div>
                <div className="text-[10px] md:text-[11px] text-white/40 font-bold leading-relaxed">
                  팀원이 깎아둔 적을 <span className="text-white/70">확실히 마무리한 해결사 킬</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative group p-6 bg-indigo-500/10 border border-indigo-500/20 rounded-[28px] text-center transition-all hover:bg-indigo-500/15">
          <div className="text-[10px] text-indigo-400 font-black uppercase mb-1 tracking-widest">선제 타격 효율</div>
          <div className="text-3xl font-black text-white mb-1">{debateData?.visuals?.initiativeSuccess || "0%"}</div>
          <div className="text-[9px] text-gray-500 font-medium">먼저 쐈을 때 킬로 이어진 비율</div>
        </div>
        <div className="relative group p-6 bg-orange-500/10 border border-orange-500/20 rounded-[28px] transition-all hover:bg-orange-500/15">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-500/20 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Clock size={24} className="text-orange-400" />
              </div>
              <div className="flex flex-col text-left">
                <div className="text-[10px] text-orange-400 font-black uppercase tracking-widest">평균 대응 사격 속도</div>
                <div className="text-3xl font-black text-white">
                  {debateData?.visuals?.latency?.counter || debateData?.visuals?.counterLatency || "기록 없음"}
                </div>
                <div className="text-[9px] text-gray-500 font-medium">피격 후 반격 성공까지 소요 시간</div>
              </div>
            </div>
            
            <div className="flex flex-col text-right border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-8">
              <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">반격 성공률</div>
              <div className="text-2xl font-black text-orange-400">
                {debateData?.visuals?.coverRate || "0%"}
              </div>
              <div className="text-[8px] text-gray-500 font-medium">피격 시 교전 대응 성공 비율</div>
            </div>
          </div>

          <div className="absolute top-4 right-4 text-white/10 hover:text-white/40 cursor-help transition-colors" title="내가 피격당한 후 해당 적에게 다시 유효 타격을 입히기까지의 평균 시간 및 비율입니다.">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
        </div>
      </div>

      {/* [V3.0] Tactical Mastery Summary */}
      {debateData?.visuals?.tactical && (
        <div className="p-8 bg-black/60 rounded-[32px] border border-white/10 shadow-xl overflow-hidden relative">
          <div className="absolute top-0 right-0 p-6 opacity-5">
            <ShieldAlert size={120} className="text-emerald-500" />
          </div>
          <div className="relative z-10 flex flex-col gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                <ShieldAlert size={16} className="text-emerald-400" />
              </div>
              <span className="text-white font-black">10경기 전술 마스터리</span>
              {debateData.visuals.latestMatchTime && (
                <div className="flex items-center gap-1.5 ml-2">
                  <div className="w-1 h-1 bg-white/20 rounded-full" />
                  <span className="text-[10px] text-white/40 font-bold">{getRelativeTime(debateData.visuals.latestMatchTime)}</span>
                </div>
              )}
              {debateData.visuals.modeDistribution && (
                <div className="flex items-center gap-1.5 ml-2">
                  <span className="px-2 py-0.5 bg-indigo-500/20 border border-indigo-500/30 rounded text-[9px] text-indigo-300 font-black tracking-tighter uppercase">
                    Ranked {debateData?.visuals?.modeDistribution?.ranked || 0}
                  </span>
                  <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] text-white/40 font-black tracking-tighter uppercase">
                    Normal {debateData?.visuals?.modeDistribution?.normal || 0}
                  </span>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-orange-400 font-black uppercase">견제 사격 성공률</span>
                <span className="text-2xl font-black text-white">{debateData?.visuals?.tactical?.suppRate || "0%"}</span>
                {debateData?.visuals?.tactical?.suppRaw && (
                  <span className="text-[10px] text-orange-300/60 font-bold">
                    {debateData.visuals.tactical.suppRaw.count}회 / {debateData.visuals.tactical.suppRaw.total}위험상황
                  </span>
                )}
                <div className="w-full h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-orange-400" style={{ width: `${parseRate(debateData?.visuals?.tactical?.suppRate || "0%")}%` }} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-blue-400 font-black uppercase">연막 세이브 확률</span>
                <span className="text-2xl font-black text-white">{debateData.visuals.tactical.smokeRate}</span>
                {debateData.visuals.tactical.smokeRaw && (
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-blue-300/60 font-bold whitespace-nowrap">
                          {debateData.visuals.tactical.smokeRaw.count} / {debateData.visuals.tactical.smokeRaw.total} 회
                        </span>
                        {(debateData.visuals.tactical.smokeRaw.teamCover ?? 0) > 0 && (
                          <span className="text-[9px] text-cyan-400 font-black whitespace-nowrap bg-cyan-400/20 px-1.5 py-0.5 rounded border border-cyan-400/30">
                            팀커버 +{debateData.visuals.tactical.smokeRaw.teamCover}
                          </span>
                        )}
                      </div>
                    </div>
                )}
                <div className="w-full h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-blue-400" style={{ width: `${parseRate(debateData.visuals.tactical.smokeRate)}%` }} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-pink-400 font-black uppercase">부활 성공률</span>
                <span className="text-2xl font-black text-white">{debateData.visuals.tactical.reviveRate}</span>
                {debateData.visuals.tactical.reviveRaw && (
                  <span className="text-[10px] text-pink-300/60 font-bold">
                    {debateData.visuals.tactical.reviveRaw.count}회 / {debateData.visuals.tactical.reviveRaw.total}회 기절
                  </span>
                )}
                <div className="w-full h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-pink-400" style={{ width: `${parseRate(debateData.visuals.tactical.reviveRate)}%` }} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-purple-400 font-black uppercase">전술 대응력 (복수/미끼)</span>
                <span className="text-2xl font-black text-white">{debateData.visuals.tactical.baitCount}회</span>
                <div className="text-[9px] text-gray-500 font-bold mt-1">최근 10경기 합계</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {debateData?.debateIssues?.map((issue, idx) => (
          <div key={idx} className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden transition-all hover:border-white/20">
            <button
              onClick={() => setOpenIssueIdx(openIssueIdx === idx ? null : idx)}
              className="w-full p-6 flex justify-between items-center text-left group"
            >
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">{issue.topic}</span>
                <h4 className="text-lg font-black text-white group-hover:text-indigo-300 transition-colors">{issue.question}</h4>
              </div>
              <div className="flex items-center gap-4">
                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                  issue.winner === "spicy" ? "bg-red-500/20 text-red-400 border border-red-500/30" : 
                  issue.winner === "kind" ? "bg-green-500/20 text-green-400 border border-green-500/30" : 
                  "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                }`}>
                  {issue.winner === "spicy" ? "매운맛 승" : issue.winner === "kind" ? "착한맛 승" : "무승부"}
                </div>
                <svg className={`w-6 h-6 text-white/50 transition-transform ${openIssueIdx === idx ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
              </div>
            </button>

            {openIssueIdx === idx && (
              <div className="px-6 pb-6 animate-in slide-in-from-top-4 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`p-5 rounded-2xl border transition-all ${issue.winner === "kind" ? "bg-green-500/5 border-green-500/30 ring-1 ring-green-500/20" : "bg-black/30 border-white/10"}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">😊</span>
                      <span className="text-xs font-black text-green-400 uppercase">KIND COACH</span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed font-medium">&quot;{issue.kindOpinion}&quot;</p>
                  </div>
 
                  <div className={`p-5 rounded-2xl border transition-all ${issue.winner === "spicy" ? "bg-red-500/5 border-red-500/30 ring-1 ring-red-500/20" : "bg-black/30 border-white/10"}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">⚡</span>
                      <span className="text-xs font-black text-red-400 uppercase">SPICY BOMBER</span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed font-medium">&quot;{issue.spicyOpinion}&quot;</p>
                  </div>
                </div>

                <div className="mt-8 p-6 bg-black/40 rounded-2xl border border-white/5">
                  <div className="flex flex-col gap-1 text-center md:text-left mb-8">
                    <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">데이터 증거 (Tactical Evidence)</span>
                    <span className="text-lg font-black text-white">{issue.topic} 상세 비교</span>
                  </div>
                  
                  <div className="space-y-4">
                    {issue.userStats.map((uStat: { label: string; value: string }, sIdx: number) => {
                      const bStat = issue.benchmarkStats[sIdx];
                      return (
                        <div key={sIdx} className="grid grid-cols-11 items-center gap-2 p-4 bg-white/5 rounded-xl border border-white/5 group hover:bg-white/10 transition-colors">
                          <div className="col-span-4 text-right">
                            <div className="text-lg md:text-xl font-black text-indigo-400">{uStat.value}</div>
                            <div className="text-[9px] text-gray-500 font-bold uppercase">{uStat.label}</div>
                          </div>
                          
                          <div className="col-span-3 flex flex-col items-center justify-center gap-1">
                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-black text-white/20 group-hover:text-white/40 border border-white/10">VS</div>
                          </div>

                          <div className="col-span-4 text-left">
                            <div className="text-lg md:text-xl font-black text-gray-400">{bStat?.value || "N/A"}</div>
                            <div className="text-[9px] text-gray-500 font-bold uppercase">{bStat?.label || uStat.label}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-8 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-white/10 rounded-[2rem] shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
          <span className="text-8xl">⚖️</span>
        </div>
        <div className="relative z-10">
          <h4 className="text-xs font-black text-indigo-400 uppercase tracking-[0.2em] mb-4">Final Verdict</h4>
          <p className="text-xl md:text-2xl font-black text-white leading-tight mb-8">&quot;{debateData?.finalVerdict}&quot;</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {debateData?.actionItems?.map((item: { icon: string; title: string; desc: string }, idx: number) => (
              <div key={idx} className="flex items-start gap-4 p-4 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-colors">
                <span className="text-2xl">{item.icon}</span>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-black text-white">{item.title}</span>
                  <span className="text-xs text-gray-400 font-medium leading-normal">{item.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
