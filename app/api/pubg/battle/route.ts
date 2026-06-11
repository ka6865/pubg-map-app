import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeName } from "@/lib/pubg-analysis/utils";
import { estimateAverageTierFromRows } from "@/lib/pubg-analysis/tierAveraging";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 비교할 지표 목록
const METRICS = [
  { key: "damage",          label: "평균 딜량",       icon: "💥", unit: "",   higherIsBetter: true },
  { key: "kills",           label: "평균 킬",         icon: "🎯", unit: "킬", higherIsBetter: true },
  { key: "duel_win_rate",   label: "1:1 교전 승률",   icon: "⚔️", unit: "%",  higherIsBetter: true },
  { key: "initiative_rate", label: "선제 타격률",     icon: "🚀", unit: "%",  higherIsBetter: true },
  { key: "reversal_rate",   label: "역전 성공률",     icon: "🔄", unit: "%",  higherIsBetter: true },
  { key: "counter_latency_ms", label: "반응 속도",    icon: "⚡", unit: "s",  higherIsBetter: false },
  { key: "revive_rate",     label: "부활 성공률",     icon: "💚", unit: "%",  higherIsBetter: true },
  { key: "trade_rate",      label: "복수 성공률",     icon: "🔄", unit: "%",  higherIsBetter: true },
  { key: "solo_kill_rate",  label: "솔로 킬 비중",    icon: "🔥", unit: "%",  higherIsBetter: true },
  { key: "death_phase",     label: "평균 생존 페이즈", icon: "⏱️", unit: "ph", higherIsBetter: true },
] as const;

type MetricKey = typeof METRICS[number]["key"];

function calcAvg(data: any[], key: MetricKey): number | null {
  const vals = data
    .map((d) => d[key])
    .filter((v) => v !== null && v !== undefined && v !== -1 && !isNaN(Number(v)));
  if (vals.length === 0) return null;
  const avg = vals.reduce((a, b) => a + Number(b), 0) / vals.length;
  if (key === "counter_latency_ms") {
    return Number((avg / 1000).toFixed(2));
  }
  return Number(avg.toFixed(1));
}

const MAX_COMPARE_MATCHES = 20;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawNick1 = searchParams.get("nick1")?.trim() || "";
  const rawNick2 = searchParams.get("nick2")?.trim() || "";
  const matchType = searchParams.get("matchType") || "all";

  if (!rawNick1 || !rawNick2) {
    return NextResponse.json({ error: "두 닉네임이 필요합니다." }, { status: 400 });
  }

  // 1. 캐시에서 정확한 닉네임 및 플랫폼 조회 시도
  const getCorrectNickname = async (input: string) => {
    const { data } = await supabase
      .from('pubg_player_cache')
      .select('nickname')
      .eq('lower_nickname', input.toLowerCase())
      .maybeSingle();
    return data?.nickname || input;
  };

  const [actualNick1, actualNick2] = await Promise.all([
    getCorrectNickname(rawNick1),
    getCorrectNickname(rawNick2)
  ]);

  const nick1 = normalizeName(actualNick1);
  const nick2 = normalizeName(actualNick2);

  if (nick1 === nick2) {
    return NextResponse.json({ error: "서로 다른 닉네임을 입력해 주세요." }, { status: 400 });
  }

  const SELECT_COLS = [
    "damage", "kills", "initiative_rate", "reversal_rate", "counter_latency_ms", "revive_rate", "trade_rate",
    "duel_win_rate", "solo_kill_rate", "death_phase", "tier", "score", "game_mode", "created_at",
  ].join(", ");

  const buildQuery = (nickname: string) => {
    let q = supabase
      .from("global_benchmarks")
      .select(SELECT_COLS)
      .eq("player_id", nickname)
      .not("game_mode", "ilike", "%training%")
      .not("game_mode", "ilike", "%tdm%")
      .order("created_at", { ascending: false })
      .limit(MAX_COMPARE_MATCHES);

    if (matchType === "official") {
      q = q.eq("match_type", "official");
    } else if (matchType === "competitive") {
      q = q.eq("match_type", "competitive");
    }
    return q;
  };

  const [r1, r2] = await Promise.all([
    buildQuery(nick1),
    buildQuery(nick2),
  ]);

  if (!r1.data?.length) {
    return NextResponse.json(
      { error: `'${rawNick1}' 의 분석 데이터가 없습니다. 전적 분석을 먼저 실행해 주세요.` },
      { status: 404 }
    );
  }
  if (!r2.data?.length) {
    return NextResponse.json(
      { error: `'${rawNick2}' 의 분석 데이터가 없습니다. 전적 분석을 먼저 실행해 주세요.` },
      { status: 404 }
    );
  }

  const availableRows1 = r1.data! as any[];
  const availableRows2 = r2.data! as any[];
  const comparisonMatchCount = Math.min(availableRows1.length, availableRows2.length, MAX_COMPARE_MATCHES);
  const rows1 = availableRows1.slice(0, comparisonMatchCount);
  const rows2 = availableRows2.slice(0, comparisonMatchCount);

  // 항목별 평균 계산: 두 플레이어 중 더 적은 분석 경기 수를 기준으로 동일 개수 비교
  const avg1 = Object.fromEntries(METRICS.map((m) => [m.key, calcAvg(rows1, m.key)]));
  const avg2 = Object.fromEntries(METRICS.map((m) => [m.key, calcAvg(rows2, m.key)]));

  // 항목별 승/패 판정
  const comparisons = METRICS.map((m) => {
    const v1 = avg1[m.key] as number | null;
    const v2 = avg2[m.key] as number | null;
    
    let winner: "nick1" | "nick2" | "draw" = "draw";

    if (v1 === null || v2 === null) {
      winner = "draw";
    } else {
      // 지표별 변별력을 위한 임계값 조정 (무승부 방지)
      let threshold = 0.1; 
      if (m.key === "damage") threshold = 20;
      else if (m.key === "death_phase") threshold = 0.5;
      else if (m.key === "kills") threshold = 0.1;
      else if (m.key === "counter_latency_ms") threshold = 0.15;
      
      const diff = Math.abs(v1 - v2);
      winner = diff < threshold ? "draw" : m.higherIsBetter ? (v1 > v2 ? "nick1" : "nick2") : (v1 < v2 ? "nick1" : "nick2");
    }

    return { ...m, v1: v1 ?? 0, v2: v2 ?? 0, winner };
  });

  const tier1 = estimateAverageTierFromRows(rows1);
  const tier2 = estimateAverageTierFromRows(rows2);

  const score = {
    nick1: comparisons.filter((c) => c.winner === "nick1").length,
    nick2: comparisons.filter((c) => c.winner === "nick2").length,
    draw:  comparisons.filter((c) => c.winner === "draw").length,
  };

  const overallWinner =
    score.nick1 > score.nick2 ? actualNick1 :
    score.nick2 > score.nick1 ? actualNick2 : "draw";

  return NextResponse.json({
    nick1: actualNick1,
    nick2: actualNick2,
    tier1, tier2,
    matchCount1: rows1.length,
    matchCount2: rows2.length,
    availableMatchCount1: availableRows1.length,
    availableMatchCount2: availableRows2.length,
    comparisonMatchCount,
    comparisons,
    score,
    overallWinner,
  });
}
