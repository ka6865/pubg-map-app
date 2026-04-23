"use client";

import React, { useState } from "react";

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
    tradeLatency: string;
    initiativeSuccess: string;
    goldenTime?: { early: number; mid1: number; mid2: number; late: number };
    killContrib?: { solo: number; cleanup: number };
    bluezoneWaste?: number;
  };
}

export const RecentAISummary = ({ matchIds, nickname, platform }: { matchIds: string[]; nickname: string; platform: string }) => {
  const [debateData, setDebateData] = useState<DebateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openIssueIdx, setOpenIssueIdx] = useState<number | null>(null);

  const handleFetchSummary = async () => {
    if (loading || debateData) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/pubg/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchIds, nickname, platform, coachingStyle: "debate" }),
      });

      if (!response.ok) throw new Error("분석 중 오류가 발생했습니다.");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
        }
        
        try {
          const cleanJson = fullText.replace(/```json\n?|```/g, "").trim();
          const parsed = JSON.parse(cleanJson);
          setDebateData(parsed);
        } catch (e) {
          console.error("JSON 파싱 에러:", e, fullText);
          setError("데이터를 정리하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getScore = () => {
    if (!debateData) return { kind: 0, spicy: 0, draw: 0 };
    const scoreMap = { kind: 0, spicy: 0, draw: 0 };
    debateData.debateIssues.forEach(issue => {
      scoreMap[issue.winner]++;
    });
    return scoreMap;
  };

  const score = getScore();

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
        <span>최근 10경기 AI 끝장 토론 시작 (V19 Tactical)</span>
      </button>
    );
  }

  if (loading) {
    return (
      <div className="p-12 bg-white/5 rounded-3xl border border-white/10 text-center">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-6" />
        <p className="text-gray-400 animate-pulse">V19 분석 엔진이 정밀 텔레메트리 데이터를 대조 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-700">
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
              <span className="text-[10px] text-amber-500 font-black uppercase tracking-[0.2em] mb-1">Signature Mastery</span>
              <h2 className="text-xl md:text-2xl text-white font-black tracking-tight mb-1">{debateData.signature}</h2>
              <p className="text-[11px] text-gray-500 font-bold leading-relaxed">{debateData.signatureSub || "데이터 분석을 통한 플레이 스타일 정의"}</p>
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
                자기장 손실: {debateData.visuals.bluezoneWaste}회
              </div>
            )}
          </div>

          <div className="space-y-12 relative z-10">
            <div className="relative pt-12">
              <div className="grid grid-cols-4 gap-6 h-48 items-end relative">
                {[
                  { label: "0-5분", val: debateData.visuals.goldenTime.early, color: "from-blue-400 to-blue-600", desc: "초반 교전" },
                  { label: "5-15분", val: debateData.visuals.goldenTime.mid1, color: "from-indigo-400 to-indigo-600", desc: "중반 대치" },
                  { label: "15-25분", val: debateData.visuals.goldenTime.mid2, color: "from-purple-400 to-purple-600", desc: "후반 운영" },
                  { label: "25분+", val: debateData.visuals.goldenTime.late, color: "from-pink-400 to-pink-600", desc: "엔딩 싸움" },
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
                    <div key={idx} className="flex flex-col items-center gap-5 group cursor-default h-full">
                      <div className="relative w-full flex-1 flex items-end justify-center bg-white/10 rounded-2xl overflow-hidden border border-white/10 shadow-inner">
                        <div className="absolute top-4 inset-x-0 text-center z-20">
                          <div className="text-[14px] font-black text-white drop-shadow-md group-hover:scale-110 transition-transform">
                            {Math.round(item.val).toLocaleString()}
                          </div>
                          <div className="text-[9px] font-black text-white/40 uppercase">DMG</div>
                        </div>
                        <div 
                          className={`w-full bg-gradient-to-t ${item.color} transition-all duration-1000 ease-out shadow-[0_-4px_20px_rgba(0,0,0,0.5)] relative z-10`} 
                          style={{ height: `${barHeight}%` }}
                        >
                          <div className="absolute top-0 left-0 right-0 h-1 bg-white/30" />
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <div className="text-[14px] text-white font-black tracking-tight">{item.label}</div>
                        <div className="text-[10px] text-white/40 font-black uppercase tracking-tighter">{item.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-12 pt-10 border-t border-white/10">
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] text-white/50 font-black tracking-widest uppercase">Solo Dominance</div>
                  <div className="px-3 py-1 bg-yellow-400/10 rounded-lg text-[14px] text-yellow-400 font-black tracking-tighter">{debateData.visuals.killContrib?.solo || 0} KILLS</div>
                </div>
                <div className="h-4 bg-white/5 rounded-full overflow-hidden p-1 border border-white/5">
                  <div 
                    className="h-full bg-gradient-to-r from-yellow-500 to-yellow-300 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(234,179,8,0.4)]" 
                    style={{ width: `${Math.min(100, (debateData.visuals.killContrib?.solo || 0) * 20)}%` }} 
                  />
                </div>
                <div className="text-[11px] text-white/40 font-bold leading-relaxed">
                  내 딜 비중 70% 이상의 <span className="text-white/70">순수 무력 솔로 킬</span>
                </div>
              </div>

              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] text-white/50 font-black tracking-widest uppercase">Team Cleanup</div>
                  <div className="px-3 py-1 bg-green-400/10 rounded-lg text-[14px] text-green-400 font-black tracking-tighter">{debateData.visuals.killContrib?.cleanup || 0} KILLS</div>
                </div>
                <div className="h-4 bg-white/5 rounded-full overflow-hidden p-1 border border-white/5">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 to-green-300 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(34,197,94,0.4)]" 
                    style={{ width: `${Math.min(100, (debateData.visuals.killContrib?.cleanup || 0) * 20)}%` }} 
                  />
                </div>
                <div className="text-[11px] text-white/40 font-bold leading-relaxed">
                  팀원이 깎아둔 적을 <span className="text-white/70">확실히 마무리한 해결사 킬</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="relative group p-6 bg-indigo-500/10 border border-indigo-500/20 rounded-[28px] text-center transition-all hover:bg-indigo-500/15">
          <div className="text-[10px] text-indigo-400 font-black uppercase mb-1 tracking-widest">선제 타격 효율</div>
          <div className="text-3xl font-black text-white mb-1">{debateData?.visuals?.initiativeSuccess || "0%"}</div>
          <div className="text-[9px] text-gray-500 font-medium">먼저 쐈을 때 킬로 이어진 비율</div>
        </div>
        <div className="relative group p-6 bg-red-500/10 border border-red-500/20 rounded-[28px] text-center transition-all hover:bg-red-500/15">
          <div className="absolute top-4 right-4 text-white/20 hover:text-white/60 cursor-help transition-colors" title="아군 기절 후 15초 이내에 적에게 데미지를 입히면 '복수 시도'로 인정됩니다. 0%라면 백업 사격이 전혀 없었다는 뜻입니다.">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div className="text-[10px] text-red-400 font-black uppercase mb-1 tracking-widest">평균 반격 속도</div>
          <div className="text-3xl font-black text-white mb-1">{debateData?.visuals?.tradeLatency || "0.00s"}</div>
          <div className="text-[9px] text-gray-500 font-medium">피격 후 대응 사격까지 걸린 시간</div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {debateData?.debateIssues.map((issue, idx) => (
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
                  {issue.winner === "spicy" ? "⚡ SPICY WIN" : issue.winner === "kind" ? "😊 KIND WIN" : "🤝 DRAW"}
                </div>
                <span className={`transform transition-transform text-gray-500 ${openIssueIdx === idx ? "rotate-180" : ""}`}>▼</span>
              </div>
            </button>

            {openIssueIdx === idx && (
              <div className="p-6 pt-0 border-t border-white/5 animate-in slide-in-from-top-4 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  <div className={`p-5 rounded-2xl border transition-all ${issue.winner === "kind" ? "bg-green-500/5 border-green-500/20" : "bg-black/20 border-white/5 opacity-60"}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">😊</span>
                      <span className="text-xs font-black text-green-400 uppercase">KIND COACH</span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed font-medium">&quot;{issue.kindOpinion}&quot;</p>
                  </div>

                  <div className={`p-5 rounded-2xl border transition-all ${issue.winner === "spicy" ? "bg-red-500/5 border-red-500/20" : "bg-black/20 border-white/5 opacity-60"}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">⚡</span>
                      <span className="text-xs font-black text-red-400 uppercase">SPICY BOMBER</span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed font-medium">&quot;{issue.spicyOpinion}&quot;</p>
                  </div>
                </div>

                <div className="mt-8 p-6 bg-black/40 rounded-2xl border border-white/5 flex flex-col gap-8">
                  <div className="flex flex-col gap-1 text-center md:text-left">
                    <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">데이터 증거</span>
                    <span className="text-lg font-black text-white">{issue.topic} 수치 분석</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="flex flex-col gap-3">
                      <div className="text-[9px] text-indigo-400 font-black uppercase tracking-wider bg-indigo-500/10 self-start px-2 py-0.5 rounded">Player Stats</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {issue.userStats.map((stat, sIdx) => (
                          <div key={sIdx} className="flex flex-col">
                            <div className="text-xl font-black text-white">{stat.value}</div>
                            <div className="text-[9px] text-gray-500 font-bold uppercase">{stat.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="text-[9px] text-gray-400 font-black uppercase tracking-wider bg-white/5 self-start px-2 py-0.5 rounded">Benchmark (Top 15)</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {issue.benchmarkStats.map((stat, sIdx) => (
                          <div key={sIdx} className="flex flex-col">
                            <div className="text-xl font-black text-gray-400">{stat.value}</div>
                            <div className="text-[9px] text-gray-500 font-bold uppercase">{stat.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
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
            {debateData?.actionItems.map((item, idx) => (
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
