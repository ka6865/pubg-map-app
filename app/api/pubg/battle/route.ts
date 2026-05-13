import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  { key: "revive_rate",     label: "부활 성공률",     icon: "💚", unit: "%",  higherIsBetter: true },
  { key: "trade_rate",      label: "복수 성공률",     icon: "🔄", unit: "%",  higherIsBetter: true },
  { key: "solo_kill_rate",  label: "솔로 킬 비중",    icon: "🔥", unit: "%",  higherIsBetter: true },
  { key: "death_phase",     label: "평균 생존 페이즈", icon: "⏱️", unit: "ph", higherIsBetter: true },
] as const;

type MetricKey = typeof METRICS[number]["key"];

function calcAvg(data: any[], key: MetricKey): number {
  const vals = data
    .map((d) => d[key])
    .filter((v) => v !== null && v !== undefined && v !== -1 && !isNaN(Number(v)));
  if (vals.length === 0) return 0;
  return Number((vals.reduce((a, b) => a + Number(b), 0) / vals.length).toFixed(1));
}

const TIER_RANK: Record<string, number> = { S: 4, A: 3, B: 2, C: 1 };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const nick1 = searchParams.get("nick1")?.toLowerCase().trim();
  const nick2 = searchParams.get("nick2")?.toLowerCase().trim();

  if (!nick1 || !nick2) {
    return NextResponse.json({ error: "두 닉네임이 필요합니다." }, { status: 400 });
  }
  if (nick1 === nick2) {
    return NextResponse.json({ error: "서로 다른 닉네임을 입력해 주세요." }, { status: 400 });
  }

  const SELECT_COLS = [
    "damage", "kills", "initiative_rate", "revive_rate", "trade_rate",
    "duel_win_rate", "solo_kill_rate", "death_phase", "tier", "game_mode", "created_at",
  ].join(", ");

  const [r1, r2] = await Promise.all([
    supabase
      .from("global_benchmarks")
      .select(SELECT_COLS)
      .eq("player_id", nick1)
      .not("game_mode", "ilike", "%training%")
      .not("game_mode", "ilike", "%tdm%")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("global_benchmarks")
      .select(SELECT_COLS)
      .eq("player_id", nick2)
      .not("game_mode", "ilike", "%training%")
      .not("game_mode", "ilike", "%tdm%")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (!r1.data?.length) {
    return NextResponse.json(
      { error: `'${nick1}' 의 분석 데이터가 없습니다. 전적 분석을 먼저 실행해 주세요.` },
      { status: 404 }
    );
  }
  if (!r2.data?.length) {
    return NextResponse.json(
      { error: `'${nick2}' 의 분석 데이터가 없습니다. 전적 분석을 먼저 실행해 주세요.` },
      { status: 404 }
    );
  }

  // 항목별 평균 계산
  const avg1 = Object.fromEntries(METRICS.map((m) => [m.key, calcAvg(r1.data!, m.key)]));
  const avg2 = Object.fromEntries(METRICS.map((m) => [m.key, calcAvg(r2.data!, m.key)]));

  // 항목별 승/패 판정 (무승부 기준: 딜량 ±20, 나머지 ±2)
  const comparisons = METRICS.map((m) => {
    const v1 = avg1[m.key];
    const v2 = avg2[m.key];
    
    // 지표별 변별력을 위한 임계값 조정 (무승부 방지)
    let threshold = 0.1; 
    if (m.key === "damage") threshold = 20;
    else if (m.key === "death_phase") threshold = 0.5;
    else if (m.key === "kills") threshold = 0.1;
    
    const diff = Math.abs(v1 - v2);
    const winner: "nick1" | "nick2" | "draw" =
      diff < threshold ? "draw" : v1 > v2 ? "nick1" : "nick2";
    return { ...m, v1, v2, winner };
  });

  // 최고 티어 계산
  const rows1 = r1.data! as any[];
  const rows2 = r2.data! as any[];
  const topTier1 = rows1.reduce((a: any, b: any) =>
    (TIER_RANK[a.tier] ?? 0) > (TIER_RANK[b.tier] ?? 0) ? a : b
  ).tier ?? "C";
  const topTier2 = rows2.reduce((a: any, b: any) =>
    (TIER_RANK[a.tier] ?? 0) > (TIER_RANK[b.tier] ?? 0) ? a : b
  ).tier ?? "C";

  const score = {
    nick1: comparisons.filter((c) => c.winner === "nick1").length,
    nick2: comparisons.filter((c) => c.winner === "nick2").length,
    draw:  comparisons.filter((c) => c.winner === "draw").length,
  };

  const overallWinner =
    score.nick1 > score.nick2 ? nick1 :
    score.nick2 > score.nick1 ? nick2 : "draw";

  return NextResponse.json({
    nick1, nick2,
    tier1: topTier1, tier2: topTier2,
    matchCount1: r1.data!.length,
    matchCount2: r2.data!.length,
    comparisons,
    score,
    overallWinner,
  });
}
