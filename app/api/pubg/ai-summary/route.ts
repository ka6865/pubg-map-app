import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { RESULT_VERSION } from "@/lib/pubg-analysis/constants";

// ✅ Server Route에서는 SERVICE_ROLE_KEY 기반 서버 클라이언트 사용 (RLS 우회)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 60; 

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

    // [V11.9] ① 모든 누적 변수 통합 선언
    let totalKills = 0, totalDamage = 0, totalDamageImpact = 0, totalTeamDamageShare = 0, totalTeamKillShare = 0;
    let totalTeammateKnocks = 0, totalSuppCount = 0, totalTradeKills = 0, totalSmokeCount = 0;
    let totalRevCount = 0, totalBaitCount = 0, totalStunCount = 0;
    let totalCoverSuccess = 0, totalCoverAttempts = 0;
    let totalInitiativeSuccess = 0, totalInitiativeAttempts = 0;
    let totalCrossfireCount = 0, totalTeamWipes = 0, totalMaxHitDist = 0;
    let totalDuelWins = 0, totalDuelLosses = 0, totalReversalWins = 0;
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

    // [V11.9] ② 단일 루프로 모든 지표 집계 (최적화)
    detailedMatches.forEach((m: any) => {
      // 랭크/일반 구분
      const isRanked = m.matchType === 'competitive' || (m.gameMode || "").includes("competitive");
      if (isRanked) rankedCount++; else normalCount++;

      // 팀플레이 및 교전 (tradeStats)
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

      // 아이템 사용 및 자기장 전략
      totalSmokeCount += m.itemUseSummary?.smokes || 0;
      totalStunCount += m.itemUseSummary?.stuns || 0;
      totalEdgePlay += m.zoneStrategy?.edgePlayCount || 0;
      totalFatalDelay += m.zoneStrategy?.fatalDelayCount || 0;
      totalStunHits += m.combatPressure?.stunHits || 0;

      // 주도권
      if (m.initiativeSampleCount !== undefined) {
        totalInitiativeAttempts += m.initiativeSampleCount;
        totalInitiativeSuccess += Math.round(((m.initiative_rate || 0) / 100) * m.initiativeSampleCount);
      }

      // 공간 전술 (isolationData)
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

      // 듀얼 및 압박
      if (m.duelStats) {
        totalDuelWins += m.duelStats.wins || 0;
        totalDuelLosses += m.duelStats.losses || 0;
        totalReversalWins += m.duelStats.reversals || 0;
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

      // 골든타임 딜량
      if (m.goldenTimeDamage) {
        goldenTimeFinal.early += (m.goldenTimeDamage.early || 0);
        goldenTimeFinal.mid1 += (m.goldenTimeDamage.mid1 || 0);
        goldenTimeFinal.mid2 += (m.goldenTimeDamage.mid2 || 0);
        goldenTimeFinal.late += (m.goldenTimeDamage.late || 0);
      }

      // 킬 분류
      if (m.killContribution) {
        killContribFinal.solo += (m.killContribution.solo || 0);
        killContribFinal.cleanup += (m.killContribution.cleanup || 0);
      }

      // [V11.9] 기본 스탯 및 배지 통합
      totalKills += (m.stats?.kills || 0);
      totalDamage += (m.stats?.damageDealt || 0);
      totalDamageImpact += (m.teamImpact?.damageImpact || 0);
      totalTeamDamageShare += (m.teamImpact?.teamDamageShare || 0);
      totalTeamKillShare += (m.teamImpact?.teamKillShare || 0);
      if (m.badges) allBadges.push(...m.badges);

      // 운영 및 생존
      totalDeathPhase += (m.deathPhase || 0);
      totalBluezoneWaste += (m.bluezoneWaste || 0);
    });

    const mLen = Math.max(1, detailedMatches.length);
    const avgDamage = Math.floor(totalDamage / mLen);
    const avgKills = Number((totalKills / mLen).toFixed(1));
    const avgDamageImpact = Number((totalDamageImpact / mLen).toFixed(1));
    const avgTeamDamageShare = Number((totalTeamDamageShare / mLen).toFixed(1));
    const avgTeamKillShare = Number((totalTeamKillShare / mLen).toFixed(1));

    const badgeCounts: Record<string, number> = {};
    allBadges.forEach((b: any) => { if (b?.name) badgeCounts[b.name] = (badgeCounts[b.name] || 0) + 1; });
    const topBadges = Object.entries(badgeCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => `${name}(${count}회)`).join(", ");

    // [V11.9] ③ 집계 결과 기반 파생 지표 계산 (정규화)
    const userInitiativeRate = totalInitiativeAttempts > 0 ? Math.round((totalInitiativeSuccess / totalInitiativeAttempts) * 100) : 0;
    const avgBackupLatency = backupLatencies.length > 0 ? (backupLatencies.reduce((a, b) => a + b, 0) / backupLatencies.length / 1000).toFixed(2) + "s" : "측정 불가";
    const avgReactionLatency = reactionLatencies.length > 0 ? (reactionLatencies.reduce((a, b) => a + b, 0) / reactionLatencies.length / 1000).toFixed(2) + "s" : "N/A";
    const avgCoverRate = totalCoverAttempts > 0 ? Math.round((totalCoverSuccess / totalCoverAttempts) * 100) : 0;
    const totalDuels = totalDuelWins + totalDuelLosses;
    const avgDuelWinRate = totalDuels > 0 ? Math.round((totalDuelWins / totalDuels) * 100) : 0;
    const avgDeathPhase = mLen > 0 ? Number((totalDeathPhase / mLen).toFixed(1)) : 0;
    const avgPressureIndex = Number((detailedMatches.reduce((acc: number, m: any) => acc + (m.combatPressure?.pressureIndex || 0), 0) / mLen).toFixed(2));
    const avgUtilityEfficiency = totalUtilityThrows > 0 ? Math.round(totalUtilityDamage / totalUtilityThrows) : 0;

    // 공간 전술 문자열 정규화
    const avgMinDistStr = isolationCountFinal > 0 ? (totalMinDist / isolationCountFinal).toFixed(1) + "m" : "N/A";
    const avgHeightDiffStr = isolationCountFinal > 0 ? (totalHeightDiff / isolationCountFinal).toFixed(1) + "m" : "N/A";
    const avgIsolationStr = isolationCountFinal > 0 ? (totalIsolationIndexFinal / isolationCountFinal).toFixed(2) : "0";

    // 골든타임 평균화
    const goldenTimeAvg = {
      early: Math.round(goldenTimeFinal.early / mLen),
      mid1: Math.round(goldenTimeFinal.mid1 / mLen),
      mid2: Math.round(goldenTimeFinal.mid2 / mLen),
      late: Math.round(goldenTimeFinal.late / mLen),
    };

    // 킬 분류 비율
    const totalKillContrib = killContribFinal.solo + killContribFinal.cleanup;
    const soloKillRate = totalKillContrib > 0 ? Math.round((killContribFinal.solo / totalKillContrib) * 100) : 0;

    // 매치 타임라인 및 최신 시간
    const matchTimes = detailedMatches.map((m: any) => {
      const d = new Date(m.createdAt || Date.now());
      return isNaN(d.getTime()) ? Date.now() : d.getTime();
    });
    const latestMatchTime = matchTimes.length > 0 ? new Date(Math.max(...matchTimes)).toISOString() : new Date().toISOString();

    // [V11.9] ④ 엘리트 벤치마크 데이터 로드 (Supabase)
    const { data: globalStats } = await supabase.from("global_benchmarks")
      .select("*")
      .not("game_mode", "ilike", "%tdm%");
    
    let avgRealInitiativeSuccessFinal = 55, avgRealPressureFinal = 1.5, avgBaselineDamageFinal = 450, avgDeathPhaseElite = 6;
    let b_isolationIndex = 1.0, b_minDist = 15, b_counterLatency = 0.5, b_soloKillRate = 50, b_reviveRate = 30, b_tradeRate = 35;
    
    if (globalStats && globalStats.length >= 5) {
      const gLen = globalStats.length;
      avgRealPressureFinal = Number((globalStats.reduce((acc, s) => acc + (s.pressure_index || 0), 0) / gLen).toFixed(2));
      avgBaselineDamageFinal = Math.round(globalStats.reduce((acc, s) => acc + (s.damage || 0), 0) / gLen);
      avgRealInitiativeSuccessFinal = Math.round(globalStats.reduce((acc, s) => acc + (s.initiative_rate || 0), 0) / gLen);
      b_isolationIndex = Number((globalStats.reduce((acc, s) => acc + (s.isolation_index || 0), 0) / gLen).toFixed(2));
      b_minDist = Math.round(globalStats.reduce((acc, s) => acc + (s.min_dist || 0), 0) / gLen);
      b_counterLatency = Number((globalStats.reduce((acc, s) => acc + (s.counter_latency_ms || 500), 0) / gLen / 1000).toFixed(2));
      b_soloKillRate = Math.round(globalStats.reduce((acc, s) => acc + (s.solo_kill_rate || 0), 0) / gLen);
      b_reviveRate = Math.round(globalStats.reduce((acc, s) => acc + (s.revive_rate || 0), 0) / gLen);
      b_tradeRate = Math.round(globalStats.reduce((acc, s) => acc + (s.trade_rate || 0), 0) / gLen);
      avgDeathPhaseElite = Number((globalStats.reduce((acc, s) => acc + (s.death_phase || 0), 0) / gLen).toFixed(1));
    }


    // [V7.4] ③ 프롬프트 구성
    const promptLines = [
      "당신들은 PUBG 전술 분석 데스크의 전문 코치입니다. 최근 10경기 데이터를 바탕으로 끝장 토론을 진행하십시오.",
      "1. KIND COACH: 획득한 배지를 근거로 유저의 강점을 극대화하고 멘탈을 케어하십시오.",
      "2. SPICY BOMBER: 팀 영향력(Impact)이 낮거나 배지가 적다면 실력 부족을 냉혹하게 찌르십시오.",
      "- 모든 분석 용어는 유저가 이해하기 쉬운 게임 용어를 사용하십시오. (예: 십자포화 -> 양각 노출, 고립 -> 혼자 떨어짐)",
      "- [Apple-to-Apple] 데이터 증거(userStats/benchmarkStats) 비교 시, 반드시 동일한 항목(Label)을 동일한 순서로 비교하십시오. (예: 유저의 양각 노출 vs 엘리트의 양각 노출)",
      "- [TEAMPLAY] '부활률'을 단독 토론 주제로 삼지 마십시오. 대신 연막탄 활용, 사격 지원(커버), 팀원과의 거리 유지(응집력) 등을 종합적으로 고려하여 팀플레이를 평가하십시오.",
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
      '      "userStats": [ { "label": "평균 딜량", "value": "실제값" }, { "label": "주도권 성공률", "value": "실제값%" } ],',
      '      "benchmarkStats": [ { "label": "엘리트 딜량", "value": "실제값" }, { "label": "엘리트 주도권", "value": "실제값%" } ]',
      '    }',
      '  ],',
      '  "finalVerdict": "총평",',
      '  "actionItems": [ { "icon": "🎯", "title": "목표", "desc": "구체적인 실천 팁" } ]',
      "}"
    ];

    const userPrompt = `
- 분석 대상: 최근 10경기 (팀 내 실제 딜 비중: ${avgTeamDamageShare}%, 킬 비중: ${avgTeamKillShare}%, 획득 배지: ${topBadges || "없음"})
- 실력 등급(엘리트 대비): 딜량 ${avgDamageImpact}% 
- 평균 화력: ${avgDamage} (엘리트 Benchmark: ${avgBaselineDamageFinal}), 평균 ${avgKills}킬
- [선제 공격] 주도권 성공률: ${userInitiativeRate}% (Benchmark: ${avgRealInitiativeSuccessFinal}%)
- [교전 결정력] 1:1 교전 승률: ${avgDuelWinRate}% (승리: ${totalDuelWins}회, 패배: ${totalDuelLosses}회, 역전승: ${totalReversalWins}회)
- [교전 압박] 평균 압박 지수: ${avgPressureIndex} (Benchmark: ${avgRealPressureFinal}), 최대 교전 거리: ${totalMaxHitDist}m
- [팀 기여도] 적 팀 전멸 기여: ${totalTeamWipes}회
- [반응 속도] 대응 사격: ${avgBackupLatency} (Benchmark: ${b_counterLatency}s), 반격 성공률: ${avgCoverRate}%
- [생존 환경] 고립 지수(운영/교전/사망): ${avgIsolationStr}/${isolationCountFinal>0?(totalCombatIso/isolationCountFinal).toFixed(2):"0"}/${isolationCountFinal>0?(totalDeathIso/isolationCountFinal).toFixed(2):"0"}
- [생존 세부] 아군 평균 거리: ${avgMinDistStr} (Benchmark: ${b_minDist}m), 양각(다각도) 노출: ${totalCrossfireCount}회
- [팀플레이] 아군 기절 ${totalTeammateKnocks}회 → 부활: ${totalRevCount}회, 복수(Trade): ${totalTradeKills}회 (복수 성공률: ${totalTeammateKnocks>0?Math.round((totalTradeKills/totalTeammateKnocks)*100):0}% vs Benchmark: ${b_tradeRate}%)
- [전술 기여] 견제 지원율: ${totalTeammateKnocks>0?Math.round((totalSuppCount/totalTeammateKnocks)*100):0}%, 미끼 플레이: ${totalBaitCount}회, 연막탄: ${totalSmokeCount}회, 섬광탄: ${totalStunCount}회 (적중: ${totalStunHits}회)
- [킬 분류] 솔로 킬: ${killContribFinal.solo}회, 클린업 킬: ${killContribFinal.cleanup}회 (솔로 비중: ${soloKillRate}% vs Benchmark: ${b_soloKillRate}%)
- [V11.6] 유틸리티(10경기 합계): 총 투척 ${totalUtilityThrows}회, 적중 ${totalUtilityHits}회 (정확도 ${totalUtilityThrows>0?Math.round((totalUtilityHits/totalUtilityThrows)*100):0}%), 총 데미지 ${totalUtilityDamage}, 킬 ${totalUtilityKills}회
- [운영 패턴] 평균 사망 페이즈: ${avgDeathPhase} 페이즈 (Benchmark: ${avgDeathPhaseElite} 페이즈), 자기장 누적 피해: ${totalBluezoneWaste} HP, 자기장 끝선(Edge): ${totalEdgePlay}회, 진입 지연(Fatal): ${totalFatalDelay}회
- [골든타임 딜량] 0-5분: ${goldenTimeAvg.early}, 5-15분: ${goldenTimeAvg.mid1}, 15-25분: ${goldenTimeAvg.mid2}, 25분+: ${goldenTimeAvg.late}
`;

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
      initiativeSuccess: `${userInitiativeRate}%`, pressureIndex: avgPressureIndex, coverRate: `${avgCoverRate}%`,
      duelStats: { winRate: `${avgDuelWinRate}%`, wins: totalDuelWins, losses: totalDuelLosses, reversals: totalReversalWins },
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
          teammateCount: Math.round(totalTeammateCountFinal / isolationCountFinal) 
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

