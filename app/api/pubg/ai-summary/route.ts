import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { RESULT_VERSION } from "@/lib/pubg-analysis/constants";
import { estimateUserTier } from "@/lib/pubg-analysis/benchmarkScore";

// ✅ Server Route에서는 SERVICE_ROLE_KEY 기반 서버 클라이언트 사용 (RLS 우회)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 60; 


function aggregateMatches(matches: any[]) {
  let totalKills = 0, totalDamage = 0, totalDamageImpact = 0, totalTeamDamageShare = 0, totalTeamKillShare = 0;
  let totalTeammateKnocks = 0, totalSuppCount = 0, totalTradeKills = 0, totalSmokeCount = 0;
  let totalRevCount = 0, totalBaitCount = 0, totalStunCount = 0;
  let totalCoverSuccess = 0, totalCoverAttempts = 0;
  let totalInitiativeSuccess = 0, totalInitiativeAttempts = 0;
  let totalCrossfireCount = 0, totalTeamWipes = 0, totalMaxHitDist = 0;
  let totalDuelWins = 0, totalDuelLosses = 0, totalReversalWins = 0, totalReversalAttempts = 0;
  let totalUtilityThrows = 0, totalUtilityHits = 0, totalUtilityDamage = 0, totalUtilityKills = 0;
  let totalDeathPhase = 0, totalBluezoneWaste = 0;
  let totalEdgePlay = 0, totalFatalDelay = 0, totalStunHits = 0;
  let totalIsolationIndexFinal = 0, totalCombatIso = 0, totalDeathIso = 0;
  let totalMinDist = 0, totalHeightDiff = 0, totalTeammateCountFinal = 0, isolationCountFinal = 0;
  let rankedCount = 0, normalCount = 0;
  
  const backupLatencies: number[] = [], reactionLatencies: number[] = [];
  const goldenTimeFinal = { early: 0, mid1: 0, mid2: 0, late: 0 };
  const killContribFinal = { solo: 0, cleanup: 0 };
  const allBadges: any[] = [];

  matches.forEach((m: any) => {
    const isRanked = m.matchType === 'competitive' || (m.gameMode || "").includes("competitive");
    if (isRanked) rankedCount++; else normalCount++;

    if (m.tradeStats) {
      totalTeammateKnocks += m.tradeStats.teammateKnocks || 0;
      totalSuppCount += m.tradeStats.suppCount || 0;
      totalTradeKills += m.tradeStats.tradeKills || 0;
      totalRevCount += m.tradeStats.revCount || 0;
      totalBaitCount += m.tradeStats.baitCount || 0;
      totalCoverAttempts += m.tradeStats.coverRateSampleCount || 0;
      totalCoverSuccess += (m.tradeStats.coverRate > 0 ? Math.round((m.tradeStats.coverRate / 100) * (m.tradeStats.coverRateSampleCount || 1)) : 0);
      if (m.tradeStats.counterLatencyMs > 0) backupLatencies.push(m.tradeStats.counterLatencyMs);
      if (m.tradeStats.reactionLatencyMs > 0) reactionLatencies.push(m.tradeStats.reactionLatencyMs);
    }

    totalSmokeCount += m.itemUseSummary?.smokes || 0;
    totalStunCount += m.itemUseSummary?.stuns || 0;
    totalEdgePlay += m.zoneStrategy?.edgePlayCount || 0;
    totalFatalDelay += m.zoneStrategy?.fatalDelayCount || 0;
    totalStunHits += m.combatPressure?.stunHits || 0;

    if (m.initiativeSampleCount !== undefined) {
      totalInitiativeAttempts += m.initiativeSampleCount;
      totalInitiativeSuccess += Math.round(((m.initiative_rate || 0) / 100) * m.initiativeSampleCount);
    }

    if (m.isolationData) {
      if (m.isolationData.isCrossfire) totalCrossfireCount++;
      totalIsolationIndexFinal += (m.isolationData.isolationIndex || 0);
      totalCombatIso += (m.isolationData.combatIsolation || 0);
      totalDeathIso += (m.isolationData.deathIsolation || 0);
      totalMinDist += (m.isolationData.minDist || 0);
      totalHeightDiff += (m.isolationData.heightDiff || 0);
      totalTeammateCountFinal += (m.isolationData.teammateCount || 1);
      isolationCountFinal++;
    }

    if (m.duelStats) {
      totalDuelWins += m.duelStats.wins || 0;
      totalDuelLosses += m.duelStats.losses || 0;
      totalReversalWins += m.duelStats.reversals || 0;
      totalReversalAttempts += Math.max(m.duelStats.reversalAttempts || 0, m.duelStats.reversals || 0);
    }
    if (m.combatPressure?.utilityStats) {
      const u = m.combatPressure.utilityStats;
      totalUtilityThrows += u.throwCount || 0;
      totalUtilityHits += u.hitCount || 0;
      totalUtilityDamage += u.totalDamage || 0;
      totalUtilityKills += u.killCount || 0;
    }
    totalMaxHitDist = Math.max(totalMaxHitDist, m.combatPressure?.maxHitDistance || 0);
    totalTeamWipes += m.combatPressure?.enemyTeamWipes || 0;

    if (m.goldenTimeDamage) {
      goldenTimeFinal.early += (m.goldenTimeDamage.early || 0);
      goldenTimeFinal.mid1 += (m.goldenTimeDamage.mid1 || 0);
      goldenTimeFinal.mid2 += (m.goldenTimeDamage.mid2 || 0);
      goldenTimeFinal.late += (m.goldenTimeDamage.late || 0);
    }

    if (m.killContribution) {
      killContribFinal.solo += (m.killContribution.solo || 0);
      killContribFinal.cleanup += (m.killContribution.cleanup || 0);
    }

    totalKills += (m.stats?.kills || 0);
    totalDamage += (m.stats?.damageDealt || 0);
    totalDamageImpact += (m.teamImpact?.damageImpact || 0);
    totalTeamDamageShare += (m.teamImpact?.teamDamageShare || 0);
    totalTeamKillShare += (m.teamImpact?.teamKillShare || 0);
    if (m.badges) allBadges.push(...m.badges);

    totalDeathPhase += (m.deathPhase || 0);
    totalBluezoneWaste += (m.bluezoneWaste || 0);
  });

  const mLen = Math.max(1, matches.length);
  const avgDamage = Math.floor(totalDamage / mLen);
  const avgKills = Number((totalKills / mLen).toFixed(1));
  const avgDamageImpact = Number((totalDamageImpact / mLen).toFixed(1));
  const avgTeamDamageShare = Number((totalTeamDamageShare / mLen).toFixed(1));
  const avgTeamKillShare = Number((totalTeamKillShare / mLen).toFixed(1));

  const badgeCounts: Record<string, number> = {};
  allBadges.forEach((b: any) => { if (b?.name) badgeCounts[b.name] = (badgeCounts[b.name] || 0) + 1; });
  const topBadges = Object.entries(badgeCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => `${name}(${count}회)`).join(", ");

  const userInitiativeRate = totalInitiativeAttempts > 0 ? Math.round((totalInitiativeSuccess / totalInitiativeAttempts) * 100) : 0;
  const avgBackupLatency = backupLatencies.length > 0 ? (backupLatencies.reduce((a, b) => a + b, 0) / backupLatencies.length / 1000).toFixed(2) + "s" : "측정 불가";
  const avgReactionLatency = reactionLatencies.length > 0 ? (reactionLatencies.reduce((a, b) => a + b, 0) / reactionLatencies.length / 1000).toFixed(2) + "s" : "N/A";
  const avgCoverRate = totalCoverAttempts > 0 ? Math.round((totalCoverSuccess / totalCoverAttempts) * 100) : 0;
  const totalDuels = totalDuelWins + totalDuelLosses;
  const avgDuelWinRate = totalDuels > 0 ? Math.round((totalDuelWins / totalDuels) * 100) : 0;
  const avgDeathPhase = mLen > 0 ? Number((totalDeathPhase / mLen).toFixed(1)) : 0;
  const avgPressureIndex = Number((matches.reduce((acc: number, m: any) => acc + (m.combatPressure?.pressureIndex || 0), 0) / mLen).toFixed(2));
  const totalLethalThrows = matches.reduce((acc: number, m: any) => acc + (m.itemUseStats?.lethalThrowCount || 0), 0);
  const avgUtilityEfficiency = totalLethalThrows > 0 ? Math.round(totalUtilityDamage / totalLethalThrows) : 0;

  const avgMinDistStr = isolationCountFinal > 0 ? (totalMinDist / isolationCountFinal).toFixed(1) + "m" : "N/A";
  const avgHeightDiffStr = isolationCountFinal > 0 ? (totalHeightDiff / isolationCountFinal).toFixed(1) + "m" : "N/A";
  const avgIsolationStr = isolationCountFinal > 0 ? (totalIsolationIndexFinal / isolationCountFinal).toFixed(2) : "0";

  const goldenTimeAvg = {
    early: Math.round(goldenTimeFinal.early / mLen),
    mid1: Math.round(goldenTimeFinal.mid1 / mLen),
    mid2: Math.round(goldenTimeFinal.mid2 / mLen),
    late: Math.round(goldenTimeFinal.late / mLen),
  };

  const totalKillContrib = killContribFinal.solo + killContribFinal.cleanup;
  const soloKillRate = totalKillContrib > 0 ? Math.round((killContribFinal.solo / totalKillContrib) * 100) : 0;

  const matchTimes = matches.map((m: any) => {
    const d = new Date(m.createdAt || Date.now());
    return isNaN(d.getTime()) ? Date.now() : d.getTime();
  });
  const latestMatchTime = matchTimes.length > 0 ? new Date(Math.max(...matchTimes)).toISOString() : new Date().toISOString();

  return {
    mLen, avgDamage, avgKills, avgDamageImpact, avgTeamDamageShare, avgTeamKillShare, topBadges,
    userInitiativeRate, avgBackupLatency, avgReactionLatency, avgCoverRate, avgDuelWinRate,
    totalDuelWins, totalDuelLosses, totalReversalWins, totalReversalAttempts, avgDeathPhase,
    avgPressureIndex, totalLethalThrows, avgUtilityEfficiency, avgMinDistStr, avgHeightDiffStr,
    avgIsolationStr, goldenTimeAvg, soloKillRate, latestMatchTime, killContribFinal,
    rankedCount, normalCount, totalTeammateKnocks, totalSuppCount, totalTradeKills, totalRevCount,
    totalBaitCount, totalSmokeCount, totalStunCount, totalStunHits, totalEdgePlay, totalFatalDelay,
    totalMaxHitDist, totalTeamWipes, isolationCountFinal, totalIsolationIndexFinal, totalCombatIso,
    totalDeathIso, totalMinDist, totalHeightDiff, totalCrossfireCount, totalTeammateCountFinal,
    totalUtilityThrows, totalUtilityHits, totalUtilityDamage, totalUtilityKills, totalBluezoneWaste
  };
}

export async function POST(request: Request) {
  try {
    const { matchIds, nickname, platform } = await request.json();
    const normalizeName = (n: string) => n?.toLowerCase().trim() || "";
    const lowerNickname = normalizeName(nickname);

    if (!matchIds || matchIds.length === 0) return NextResponse.json({ error: "No matches" }, { status: 400 });

    const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!geminiApiKey) return NextResponse.json({ error: "No API Key" }, { status: 500 });

    const { data: cachedMatches } = await supabase.from("processed_match_telemetry").select("match_id, data").in("match_id", matchIds.slice(0, 10)).eq("player_id", lowerNickname);
    const cachedMap = new Map();
    if (cachedMatches) {
      cachedMatches.forEach(m => {
        const fullResult = (m.data as any)?.fullResult;
        // [V11.8] 최신 엔진 버전 이상의 정밀 데이터만 캐시로 인정
        if (fullResult && fullResult.v >= RESULT_VERSION) cachedMap.set(m.match_id, fullResult);
      });
    }
    
    const targetMatchIds = matchIds.slice(0, 10);
    const missingMatchIds = targetMatchIds.filter((id: string) => !cachedMap.has(id));
    const newResultsMap = new Map();
    
    if (missingMatchIds.length > 0) {
      const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
      const host = request.headers.get('host') || 'localhost:3000';
      const baseUrl = `${protocol}://${host}`;
      for (let i = 0; i < missingMatchIds.length; i += 3) {
        const batch = missingMatchIds.slice(i, i + 3);
        await Promise.all(batch.map(async (id: string) => {
          try {
            const res = await fetch(`${baseUrl}/api/pubg/match?matchId=${id}&nickname=${nickname}&platform=${platform}`, { cache: 'no-store' });
            if (res.ok) { const data = await res.json(); if (data) newResultsMap.set(id, data); }
          } catch (e) { console.error(`[AI-SUMMARY] Match fetch failed for ${id}:`, e); }
        }));
      }
    }

    const detailedMatches = targetMatchIds.map((id: string) => cachedMap.get(id) || newResultsMap.get(id)).filter(Boolean);
    if (detailedMatches.length === 0) return NextResponse.json({ error: "분석 데이터 생성 실패" }, { status: 400 });

    // console.log(`[AI-SUMMARY] Aggregating ${detailedMatches.length} matches for ${nickname}`);

    
    const totalStats = aggregateMatches(detailedMatches);
    const {
      latestMatchTime, avgBackupLatency, avgReactionLatency, userInitiativeRate, avgPressureIndex,
      totalReversalAttempts, totalReversalWins, avgDuelWinRate, totalDuelWins, totalDuelLosses,
      avgDamageImpact, topBadges, goldenTimeAvg, killContribFinal, avgDeathPhase, totalBluezoneWaste, mLen,
      totalTeammateKnocks, totalSuppCount, totalTradeKills, totalSmokeCount, totalRevCount,
      totalBaitCount, totalStunCount, totalStunHits, totalEdgePlay, totalFatalDelay, totalMaxHitDist,
      totalTeamWipes, isolationCountFinal, totalIsolationIndexFinal, totalMinDist, totalHeightDiff, totalCrossfireCount, totalTeammateCountFinal,
      totalUtilityThrows, totalUtilityHits, totalUtilityDamage, totalUtilityKills, rankedCount, normalCount
    } = totalStats;

    const groups: Record<string, any[]> = { solo: [], duo: [], squad: [] };
    detailedMatches.forEach((m: any) => {
      const gm = m.gameMode || "squad";
      if (gm.includes('solo')) groups.solo.push(m);
      else if (gm.includes('duo')) groups.duo.push(m);
      else groups.squad.push(m);
    });

    const { data: userBenchmarks } = await supabase.from("global_benchmarks")
      .select("score, game_mode, match_id")
      .in("match_id", targetMatchIds)
      .eq("player_id", lowerNickname);

    const mainModeName = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length)[0];
    const mainModeCount = groups[mainModeName].length;
    const tierConfidence = mainModeCount >= 7 ? '높음' : mainModeCount >= 3 ? '보통' : '낮음 (데이터 부족)';

    const promptLines = [
      "당신들은 PUBG 전술 분석 데스크의 전문 코치입니다. 전달받은 경기 데이터를 바탕으로 끝장 토론을 진행하십시오.",
      "1. KIND COACH: 획득한 배지를 근거로 유저의 강점을 극대화하고 멘탈을 케어하십시오.",
      "2. SPICY BOMBER: 팀 영향력(Impact)이 낮거나 배지가 적다면 실력 부족을 냉혹하게 찌르십시오.",
      "- 모든 분석 용어는 유저가 이해하기 쉬운 게임 용어를 사용하십시오. (예: 십자포화 -> 양각 노출, 고립 -> 혼자 떨어짐)",
      "- [Apple-to-Apple] 데이터 증거(userStats/benchmarkStats) 비교 시, 반드시 동일한 항목(Label)을 동일한 순서로 비교하십시오.",
      "- [TEAMPLAY] '부활률'을 단독 토론 주제로 삼지 마십시오. 대신 연막탄 활용, 사격 지원(커버), 팀원과의 거리 유지 등을 종합적으로 고려하십시오.",
      "- 모드별(Solo/Duo/Squad)로 차이가 큰 부분이 있다면 해당 모드를 구체적으로 지목하며 분석하십시오.",
      "- debateIssues는 반드시 3개를 작성하고, 각 issue의 userStats/benchmarkStats는 인덱스별로 라벨과 항목이 완벽히 대칭되어야 합니다.",
      "반드시 아래 구조의 JSON 객체로만 응답하세요.",
      "{",
      '  "signature": "칭호", "signatureSub": "이유",',
      '  "debateIssues": [',
      '    {',
      '      "topic": "화력",',
      '      "question": "이 유저의 딜량은 충분한가?",',
      '      "spicyOpinion": "벤치마크 대비 부족한 이유 지적",',
      '      "kindOpinion": "강점 부각",',
      '      "winner": "kind|spicy|draw",',
      '      "reason": "판정 근거",',
      '      "evaluation": "종합 진단 1-2문장",',
      '      "userStats": [ { "label": "스쿼드 평균 딜량", "value": "실제값" } ],',
      '      "benchmarkStats": [ { "label": "동일 티어 딜량", "value": "실제값" } ]',
      '    }',
      '  ],',
      '  "finalVerdict": "총평",',
      '  "actionItems": [ { "icon": "🎯", "title": "목표", "desc": "구체적인 실천 팁" } ]',
      "}"
    ];

    let userPrompt = `- 분석 대상: 총 ${mLen}경기 (랭크 매치: ${rankedCount}판 포함)\n`;
    userPrompt += `- 주력 모드: ${mainModeName.toUpperCase()} (신뢰도: ${tierConfidence}, 기반: ${mainModeCount}판)\n\n`;

    let maxMatches = 0;
    let mainUserTier = "C";
    let mainBench: any = null;

    for (const [mode, gMatches] of Object.entries(groups)) {
      if (gMatches.length === 0) continue;
      const gStats = aggregateMatches(gMatches);
      
      const gMatchIds = gMatches.map((m: any) => m.id);
      const gUserBenchs = userBenchmarks?.filter(b => gMatchIds.includes(b.match_id)) || [];
      const validScores = gUserBenchs.map(b => b.score).filter(s => s !== null && s !== undefined) || [];
      const avgScore = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 55;
      const userTier = estimateUserTier(avgScore);

      const { data: globalStats } = await supabase.from("global_benchmarks")
        .select("*")
        .eq("tier", userTier)
        .ilike("game_mode", `%${mode}%`)
        .limit(200);

      let bench: any = {
         avgRealPressureFinal: 1.5, avgBaselineDamageFinal: 450, avgRealInitiativeSuccessFinal: 55,
         b_isolationIndex: 1.0, b_minDist: 15, b_counterLatency: 0.5, b_soloKillRate: 50,
         b_reviveRate: 30, b_tradeRate: 35, b_reversalRate: 25, avgDeathPhaseElite: 6,
         b_duelWinRate: userTier === 'S' ? 65 : userTier === 'A' ? 55 : userTier === 'B' ? 45 : 35
      };
      if (globalStats && globalStats.length >= 5) {
         const gLen = globalStats.length;
         bench = {
           avgRealPressureFinal: Number((globalStats.reduce((acc: any, s: any) => acc + (s.pressure_index || 0), 0) / gLen).toFixed(2)),
           avgBaselineDamageFinal: Math.round(globalStats.reduce((acc: any, s: any) => acc + (s.damage || 0), 0) / gLen),
           avgRealInitiativeSuccessFinal: Math.round(globalStats.reduce((acc: any, s: any) => acc + (s.initiative_rate || 0), 0) / gLen),
           b_isolationIndex: Number((globalStats.reduce((acc: any, s: any) => acc + (s.isolation_index || 0), 0) / gLen).toFixed(2)),
           b_minDist: Math.round(globalStats.reduce((acc: any, s: any) => acc + (s.min_dist || 0), 0) / gLen),
           b_counterLatency: Number((globalStats.reduce((acc: any, s: any) => acc + (s.counter_latency_ms || 500), 0) / gLen / 1000).toFixed(2)),
           b_soloKillRate: Math.round(globalStats.reduce((acc: any, s: any) => acc + (s.solo_kill_rate || 0), 0) / gLen),
           b_reviveRate: Math.round(globalStats.reduce((acc: any, s: any) => acc + (s.revive_rate || 0), 0) / gLen),
           b_tradeRate: Math.round(globalStats.reduce((acc: any, s: any) => acc + (s.trade_rate || 0), 0) / gLen),
           b_reversalRate: Math.round(globalStats.reduce((acc: any, s: any) => acc + (s.reversal_rate || 0), 0) / gLen),
           b_duelWinRate: Math.round(globalStats.reduce((acc: any, s: any) => acc + (s.duel_win_rate || (userTier === 'S' ? 65 : userTier === 'A' ? 55 : userTier === 'B' ? 45 : 35)), 0) / gLen),
           avgDeathPhaseElite: Number((globalStats.reduce((acc: any, s: any) => acc + (s.death_phase || 0), 0) / gLen).toFixed(1))
         };
      }

      if (gMatches.length > maxMatches) {
        maxMatches = gMatches.length;
        mainUserTier = userTier;
        mainBench = bench;
      }

      const isLow = gMatches.length <= 2;
      userPrompt += `### [${mode.toUpperCase()} 모드 분석] (${gMatches.length}판${isLow ? ' - 참고용: 데이터 부족' : ''})\n`;
      userPrompt += `- 유저 티어: ${userTier}\n`;
      userPrompt += `- 평균 화력: ${gStats.avgDamage} (동일 티어 Benchmark: ${bench.avgBaselineDamageFinal}), 평균 ${gStats.avgKills}킬\n`;
      userPrompt += `- [선제 공격] 주도권 성공률: ${gStats.userInitiativeRate}% (Benchmark: ${bench.avgRealInitiativeSuccessFinal}%)\n`;
      const benchDuelWinRate = bench.b_duelWinRate || (userTier === 'S' ? 65 : userTier === 'A' ? 55 : userTier === 'B' ? 45 : 35);
      userPrompt += `- [교전 결정력] 1:1 교전 승률: ${gStats.avgDuelWinRate}% (Benchmark: ${benchDuelWinRate}%, 승리: ${gStats.totalDuelWins}회, 패배: ${gStats.totalDuelLosses}회, 역전승: ${gStats.totalReversalWins}회)\n`;
      userPrompt += `- [교전 압박] 평균 압박 지수: ${gStats.avgPressureIndex} (Benchmark: ${bench.avgRealPressureFinal}), 최대 교전 거리: ${gStats.totalMaxHitDist}m\n`;
      if (mode !== 'solo') {
        userPrompt += `- [팀 기여도] 적 팀 전멸 기여: ${gStats.totalTeamWipes}회\n`;
        userPrompt += `- [팀플레이] 아군 기절 ${gStats.totalTeammateKnocks}회 → 부활: ${gStats.totalRevCount}회, 복수(Trade): ${gStats.totalTradeKills}회 (복수 성공률: ${gStats.totalTeammateKnocks>0?Math.round((gStats.totalTradeKills/gStats.totalTeammateKnocks)*100):0}% vs Benchmark: ${bench.b_tradeRate}%)\n`;
        userPrompt += `- [전술 기여] 견제 지원율: ${gStats.totalTeammateKnocks>0?Math.round((gStats.totalSuppCount/gStats.totalTeammateKnocks)*100):0}%, 미끼: ${gStats.totalBaitCount}회, 연막: ${gStats.totalSmokeCount}회, 섬광: ${gStats.totalStunCount}회\n`;
      }
      userPrompt += `- [반응 속도] 대응 사격: ${gStats.avgBackupLatency} (Benchmark: ${bench.b_counterLatency}s), 반격 성공률: ${gStats.totalReversalAttempts > 0 ? Math.round((gStats.totalReversalWins / gStats.totalReversalAttempts) * 100) : 0}%\n`;
      userPrompt += `- [생존 환경] 고립 지수(운영/교전/사망): ${gStats.avgIsolationStr}/${gStats.isolationCountFinal>0?(gStats.totalCombatIso/gStats.isolationCountFinal).toFixed(2):"0"}/${gStats.isolationCountFinal>0?(gStats.totalDeathIso/gStats.isolationCountFinal).toFixed(2):"0"}\n`;
      userPrompt += `- [킬 분류] 솔로 킬: ${gStats.killContribFinal.solo}회, 클린업 킬: ${gStats.killContribFinal.cleanup}회 (솔로 비중: ${gStats.soloKillRate}% vs Benchmark: ${bench.b_soloKillRate}%)\n`;
      userPrompt += `- [유틸리티] 총 투척 ${gStats.totalUtilityThrows}회, 적중 ${gStats.totalUtilityHits}회, 데미지 ${gStats.totalUtilityDamage}\n`;
      userPrompt += `- [운영 패턴] 평균 사망 페이즈: ${gStats.avgDeathPhase} (Benchmark: ${bench.avgDeathPhaseElite}), 자기장 누적 피해: ${Math.round(gStats.totalBluezoneWaste / gStats.mLen)} HP, 엣지(Edge) 플레이: ${gStats.totalEdgePlay}회, 진입 지연: ${gStats.totalFatalDelay}회\n\n`;
    }
// [V7.4] ④ AI 스트림 호출
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const modelsToTry = ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-2.5-flash"];
    
    let streamResult = null;
    for (const modelName of modelsToTry) {
      try {
        // console.log(`[AI-SUMMARY] Attempting: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        streamResult = await model.generateContentStream(promptLines.join("\n") + "\n\n" + userPrompt);
        if (streamResult) break;
      } catch (err: any) {
        console.error(`[AI-SUMMARY] ${modelName} failed:`, err.message || err);
      }
    }

    if (!streamResult) throw new Error("모든 AI 모델 응답 실패");

    // [V7.4] ⑤ precomputedVisuals 구성 (UI 렌더링용)
    const precomputedVisuals = {
      latestMatchTime, counterLatency: avgBackupLatency, reactionLatency: avgReactionLatency,
      initiativeSuccess: `${userInitiativeRate}%`, pressureIndex: avgPressureIndex, 
      reversalRate: `${totalReversalAttempts > 0 ? Math.round((totalReversalWins / totalReversalAttempts) * 100) : 0}%`,
      duelStats: { winRate: `${avgDuelWinRate}%`, wins: totalDuelWins, losses: totalDuelLosses, reversals: totalReversalWins, reversalAttempts: totalReversalAttempts },
      teamImpact: { damageImpact: avgDamageImpact, topBadges },
      goldenTime: goldenTimeAvg,
      killContrib: killContribFinal,
      deathPhase: avgDeathPhase,
      bluezoneWaste: Math.round(totalBluezoneWaste / mLen),
      modeDistribution: {
        ranked: rankedCount,
        normal: normalCount,
        main: rankedCount >= normalCount ? "경쟁전" : "일반전"
      },
      tactical: { 
        suppRate: totalTeammateKnocks > 0 ? Math.round((totalSuppCount / totalTeammateKnocks) * 100) + "%" : "0%",
        tradeRate: totalTeammateKnocks > 0 ? Math.round((totalTradeKills / totalTeammateKnocks) * 100) + "%" : "0%",
        smokeRate: totalTeammateKnocks > 0 ? Math.round((totalSmokeCount / totalTeammateKnocks) * 100) + "%" : "0%",
        reviveRate: totalTeammateKnocks > 0 ? Math.round((totalRevCount / totalTeammateKnocks) * 100) + "%" : "0%",
        baitCount: totalBaitCount,
        stunCount: totalStunCount,
        stunHits: totalStunHits,
        edgePlay: totalEdgePlay,
        fatalDelay: totalFatalDelay,
        maxHitDist: totalMaxHitDist,
        teamWipes: totalTeamWipes,
        isolation: isolationCountFinal > 0 ? {
          isolationIndex: Number((totalIsolationIndexFinal / isolationCountFinal).toFixed(2)),
          minDist: Math.round(totalMinDist / isolationCountFinal),
          heightDiff: Math.round(totalHeightDiff / isolationCountFinal),
          isCrossfire: totalCrossfireCount > 0,
          teammateCount: Math.round(totalTeammateCountFinal / isolationCountFinal),
          userTier: mainUserTier,
          benchmarkIsolationIndex: mainBench?.b_isolationIndex || 1.0,
          benchmarkMinDist: mainBench?.b_minDist || 15
        } : null,
        utility: {
          throwCount: totalUtilityThrows,
          hitCount: totalUtilityHits,
          totalDamage: totalUtilityDamage,
          killCount: totalUtilityKills,
          accuracy: totalUtilityThrows > 0 ? Math.round((totalUtilityHits / totalUtilityThrows) * 100) : 0
        }
      }
    };

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(JSON.stringify({ type: "visuals", data: precomputedVisuals }) + "\n"));
          for await (const chunk of streamResult.stream) { controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk", data: chunk.text() }) + "\n")); }
          controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
        } catch (e: any) { controller.error(e); } finally { controller.close(); }
      }
    }), { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } });
  } catch (error: any) {
    console.error("[AI-SUMMARY] CRITICAL ERROR:", error.message || error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

