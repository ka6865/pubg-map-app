"use client";

import { useState } from "react";
import Link from "next/link";

interface Comparison {
  key: string;
  label: string;
  icon: string;
  unit: string;
  v1: number;
  v2: number;
  winner: "nick1" | "nick2" | "draw";
}

interface BattleResult {
  nick1: string;
  nick2: string;
  tier1: string;
  tier2: string;
  matchCount1: number;
  matchCount2: number;
  comparisons: Comparison[];
  score: { nick1: number; nick2: number; draw: number };
  overallWinner: string;
}

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  S: { bg: "bg-blue-500/20",   text: "text-blue-400",   label: "S 티어" },
  A: { bg: "bg-emerald-500/20",text: "text-emerald-400", label: "A 티어" },
  B: { bg: "bg-yellow-500/20", text: "text-yellow-400",  label: "B 티어" },
  C: { bg: "bg-gray-500/20",   text: "text-gray-400",    label: "C 티어" },
};

export default function BattlePage() {
  const [nick1, setNick1] = useState("");
  const [nick2, setNick2] = useState("");
  const [result, setResult] = useState<BattleResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBattle = async () => {
    const n1 = nick1.trim();
    const n2 = nick2.trim();
    if (!n1 || !n2) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/pubg/battle?nick1=${encodeURIComponent(n1)}&nick2=${encodeURIComponent(n2)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "알 수 없는 오류");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleBattle();
  };

  return (
    <main className="min-h-screen bg-[#080810] text-white px-4 py-12">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">

        {/* 헤더 */}
        <div className="text-center">
          <Link href="/stats" className="text-xs text-gray-600 hover:text-gray-400 transition-colors mb-4 inline-block">
            ← 전적 검색으로 돌아가기
          </Link>
          <div className="text-5xl mb-4">⚔️</div>
          <h1 className="text-3xl font-black tracking-tight mb-2">전적 비교 배틀</h1>
          <p className="text-gray-500 text-sm">두 플레이어의 BGMS 분석 데이터를 항목별로 대결시킵니다</p>
          <p className="text-gray-600 text-xs mt-1">※ BGMS에서 한 번 이상 전적 분석을 받은 플레이어만 비교 가능합니다</p>
        </div>

        {/* 입력폼 */}
        <div className="p-6 bg-white/5 border border-white/10 rounded-3xl flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <input
              value={nick1}
              onChange={(e) => setNick1(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="내 닉네임"
              className="flex-1 p-4 bg-black/40 border border-indigo-500/30 rounded-2xl text-white placeholder:text-gray-600 font-bold focus:outline-none focus:border-indigo-500/70 transition-colors"
            />
            <div className="text-xl font-black text-gray-600 shrink-0">VS</div>
            <input
              value={nick2}
              onChange={(e) => setNick2(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="상대 닉네임"
              className="flex-1 p-4 bg-black/40 border border-rose-500/30 rounded-2xl text-white placeholder:text-gray-600 font-bold focus:outline-none focus:border-rose-500/70 transition-colors"
            />
          </div>
          <button
            onClick={handleBattle}
            disabled={loading || !nick1.trim() || !nick2.trim()}
            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-2xl font-black text-lg tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {loading ? "⏳ 분석 중..." : "⚔️ 대결 시작!"}
          </button>
        </div>

        {/* 에러 */}
        {error && (
          <div className="p-5 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-sm font-bold">
            ❌ {error}
          </div>
        )}

        {/* 결과 */}
        {result && (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* 총 스코어 */}
            <div className="p-6 bg-black/60 rounded-3xl border border-white/10 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-6">
                {/* 플레이어 1 */}
                <div className="text-center flex-1">
                  <div className={`inline-block px-3 py-1 rounded-full text-xs font-black mb-2 ${TIER_STYLES[result.tier1]?.bg ?? ""} ${TIER_STYLES[result.tier1]?.text ?? ""}`}>
                    {TIER_STYLES[result.tier1]?.label ?? result.tier1}
                  </div>
                  <div className="font-black text-lg text-indigo-300 truncate">{result.nick1}</div>
                  <div className="text-[10px] text-gray-600">{result.matchCount1}경기 데이터</div>
                </div>

                {/* 스코어 */}
                <div className="flex items-center gap-3 px-4">
                  <div className="text-4xl font-black text-indigo-400">{result.score.nick1}</div>
                  <div className="text-lg text-gray-600 font-black">:</div>
                  <div className="text-4xl font-black text-rose-400">{result.score.nick2}</div>
                </div>

                {/* 플레이어 2 */}
                <div className="text-center flex-1">
                  <div className={`inline-block px-3 py-1 rounded-full text-xs font-black mb-2 ${TIER_STYLES[result.tier2]?.bg ?? ""} ${TIER_STYLES[result.tier2]?.text ?? ""}`}>
                    {TIER_STYLES[result.tier2]?.label ?? result.tier2}
                  </div>
                  <div className="font-black text-lg text-rose-300 truncate">{result.nick2}</div>
                  <div className="text-[10px] text-gray-600">{result.matchCount2}경기 데이터</div>
                </div>
              </div>

              {/* 최종 승자 배너 */}
              <div className={`p-4 rounded-2xl text-center font-black text-sm ${
                result.overallWinner === result.nick1 ? "bg-indigo-500/20 border border-indigo-500/30 text-indigo-300" :
                result.overallWinner === result.nick2 ? "bg-rose-500/20 border border-rose-500/30 text-rose-300" :
                "bg-yellow-500/10 border border-yellow-500/20 text-yellow-400"
              }`}>
                {result.overallWinner === "draw"
                  ? "🤝 무승부 — 두 플레이어의 실력이 비슷합니다"
                  : `🏆 ${result.overallWinner} 승리! (${Math.max(result.score.nick1, result.score.nick2)}항목 우세)`}
              </div>
            </div>

            {/* 항목별 비교 */}
            <div className="flex flex-col gap-3">
              {result.comparisons.map((c) => {
                const n1Wins = c.winner === "nick1";
                const n2Wins = c.winner === "nick2";
                const isDraw = c.winner === "draw";
                return (
                  <div
                    key={c.key}
                    className={`p-4 rounded-2xl border flex items-center gap-4 transition-all ${
                      n1Wins ? "border-indigo-500/30 bg-indigo-500/5" :
                      n2Wins ? "border-rose-500/30 bg-rose-500/5" :
                               "border-white/10 bg-white/5"
                    }`}
                  >
                    {/* 플레이어1 값 */}
                    <div className={`flex-1 text-right font-black text-xl ${n1Wins ? "text-indigo-400" : "text-white/50"}`}>
                      {c.v1}{c.unit}
                    </div>

                    {/* 중앙: 항목명 + 승자 표시 */}
                    <div className="w-28 text-center shrink-0">
                      <div className="text-[10px] text-gray-500 font-black uppercase tracking-wider mb-1">{c.label}</div>
                      <div className="flex items-center justify-center gap-1.5 mt-1">
                        {/* 왼쪽 점 */}
                        <div className={`w-2.5 h-2.5 rounded-full ${n1Wins ? "bg-indigo-400 shadow-[0_0_6px_rgba(99,102,241,0.8)]" : "bg-white/10"}`} />
                        {/* 화살표 */}
                        <div className={`text-xs font-black ${
                          n1Wins ? "text-indigo-400" :
                          n2Wins ? "text-rose-400" :
                          "text-gray-600"
                        }`}>
                          {n1Wins ? "◀" : n2Wins ? "▶" : "—"}
                        </div>
                        {/* 오른쪽 점 */}
                        <div className={`w-2.5 h-2.5 rounded-full ${n2Wins ? "bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.8)]" : "bg-white/10"}`} />
                      </div>
                    </div>

                    {/* 플레이어2 값 */}
                    <div className={`flex-1 text-left font-black text-xl ${n2Wins ? "text-rose-400" : "text-white/50"}`}>
                      {c.v2}{c.unit}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 무승부 항목 수 */}
            {result.score.draw > 0 && (
              <div className="text-center text-xs text-gray-600">
                {result.score.draw}개 항목은 차이가 적어 무승부 처리되었습니다
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
