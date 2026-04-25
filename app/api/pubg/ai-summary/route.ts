import { NextResponse } from "next/server";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { supabase } from "../../../../lib/supabase";

export const maxDuration = 60; // 최대 60초까지 허용 (Vercel 및 로컬 타임아웃 방지)

export async function POST(request: Request) {
  try {
    const { matchIds, nickname, platform } = await request.json();
    const normalizeName = (n: string) => n?.toLowerCase().trim() || "";
    const lowerNickname = normalizeName(nickname);

    if (!matchIds || matchIds.length === 0) {
      return NextResponse.json({ error: "No matches" }, { status: 400 });
    }

    const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json({ error: "No API Key" }, { status: 500 });
    }

    // [STEP 1] 캐시 확인
    const { data: cachedMatches } = await supabase
      .from("processed_match_telemetry")
      .select("match_id, data")
      .in("match_id", matchIds.slice(0, 10))
      .eq("player_id", lowerNickname);
    const cachedMap: Map<string, any> = new Map();
    if (cachedMatches) {
      cachedMatches.forEach(m => {
        const fullResult = (m.data as any)?.fullResult;
        if (fullResult && fullResult.v >= 5.25 && fullResult.combatPressure !== undefined) cachedMap.set(m.match_id, fullResult);
      });
    }
    
    console.log(`[AI-SUMMARY] Cache Hit: ${cachedMap.size} / 10`);
    
    // 미분석 매치 처리
    const targetMatchIds = matchIds.slice(0, 10);
    const missingMatchIds = targetMatchIds.filter((id: string) => !cachedMap.has(id));
    const newResultsMap: Map<string, any> = new Map();
    
    if (missingMatchIds.length > 0) {
      console.log(`[AI-SUMMARY] ⚡ Analyzing ${missingMatchIds.length} matches in stable batches...`);
      const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
      const host = request.headers.get('host') || 'localhost:3000';
      const baseUrl = `${protocol}://${host}`;
      
      // 안정성을 위해 3개씩 묶어서 처리 (네트워크 타임아웃 방지)
      for (let i = 0; i < missingMatchIds.length; i += 3) {
        const batch = missingMatchIds.slice(i, i + 3);
        await Promise.all(batch.map(async (id: string) => {
          try {
            const res = await fetch(`${baseUrl}/api/pubg/match?matchId=${id}&nickname=${nickname}&platform=${platform}`);
            if (res.ok) {
              const data = await res.json();
              if (data && data.v >= 5.25 && data.combatPressure !== undefined) {
                newResultsMap.set(id, data);
              }
            }
          } catch (e) {
            console.error(`[AI-SUMMARY] Error analyzing ${id}:`, e);
          }
        }));
        console.log(`[AI-SUMMARY] Batch ${Math.floor(i/3) + 1} completed.`);
      }
      console.log(`[AI-SUMMARY] ⚡ All missing matches analyzed.`);
    }

    const detailedMatches = targetMatchIds.map((id: string) => cachedMap.get(id) || newResultsMap.get(id)).filter(Boolean);
    console.log(`[AI-SUMMARY] Total analyzed matches for summary: ${detailedMatches.length}`);
    if (detailedMatches.length === 0) {
      return NextResponse.json({ error: "최신 분석 데이터(3.1)를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 400 });
    }

    // 데이터 집계
    const totalKills = detailedMatches.reduce((acc: number, m: any) => acc + (m.stats?.kills || 0), 0);
    const totalDamage = detailedMatches.reduce((acc: number, m: any) => acc + (m.stats?.damageDealt || 0), 0);
    const avgDamage = Math.floor(totalDamage / detailedMatches.length);
    const avgKills = Number((totalKills / detailedMatches.length).toFixed(1));
    
    // [V37] itemUseSummary 활용
    const totalSmokesUsed = detailedMatches.reduce((acc: number, m: any) => acc + (m.itemUseSummary?.smokes || 0), 0);
    const totalFragsUsed = detailedMatches.reduce((acc: number, m: any) => acc + (m.itemUseSummary?.frags || 0), 0);
    
    let totalTeammateKnocks = 0, totalSuppCount = 0, totalSmokeCount = 0, totalRevCount = 0, totalBaitCount = 0;
    let totalDangerousKnocks = 0, totalSmokeOpps = 0, totalTeamSmokeCovered = 0, totalEnemyTeamWipes = 0, totalUtilityHits = 0;
    let totalDeathDistanceSum = 0, deathDistanceCount = 0;
    const backupLatencies: number[] = [];
    const reactionLatencies: number[] = [];
    
    const goldenTime = { early: 0, mid1: 0, mid2: 0, late: 0 };
    const killContrib = { solo: 0, cleanup: 0, other: 0 };
    let bluezoneWasteMatches = 0;
    let goldenTimeMatchCount = 0;

    const getMapSizeCategory = (mName: string) => {
      const largeMaps = ["Erangel", "Miramar", "Taego", "Rondo", "Vikendi", "Deston", "Tiger", "Desert", "Baltic", "Chimera"]; // 8x8 maps
      if (largeMaps.some(lm => mName.includes(lm) || lm.includes(mName))) return "Large";
      return "Small"; // Sanhok, Karakin, etc.
    };

    const mapCounts: Record<string, number> = {};
    const sizeCounts: Record<string, number> = { "Large": 0, "Small": 0 };
    
    detailedMatches.forEach((m: any) => {
      const mName = m.mapName || "Unknown";
      mapCounts[mName] = (mapCounts[mName] || 0) + 1;
      const size = getMapSizeCategory(mName);
      sizeCounts[size]++;

      // 1. 거리 및 전멸 집계
      if (m.teammateDistancesAtDeath) {
        const distances = Object.values(m.teammateDistancesAtDeath) as number[];
        if (distances.length > 0) {
          totalDeathDistanceSum += Math.min(...distances);
          deathDistanceCount++;
        }
      }
      if (m.tradeStats?.enemyTeamWipes) {
        totalEnemyTeamWipes += m.tradeStats.enemyTeamWipes;
      }

      // 2. 레이턴시 집계
      if (m.tradeStats?.backupLatencyMs && m.tradeStats.backupLatencyMs > 0) {
        backupLatencies.push(m.tradeStats.backupLatencyMs);
      }
      if (m.tradeStats?.reactionLatencyMs && m.tradeStats.reactionLatencyMs > 0) {
        reactionLatencies.push(m.tradeStats.reactionLatencyMs);
      }

      // 3. 전술 지표 집계
      totalTeammateKnocks += m.tradeStats?.teammateKnocks || 0;
      totalDangerousKnocks += m.tradeStats?.dangerousKnocks ?? m.tradeStats?.teammateKnocks ?? 0;
      totalSuppCount += m.tradeStats?.suppCount || 0;
      totalSmokeOpps += m.tradeStats?.smokeOpps ?? m.tradeStats?.dangerousKnocks ?? m.tradeStats?.teammateKnocks ?? 0;
      totalSmokeCount += m.tradeStats?.smokeCount || 0;
      totalTeamSmokeCovered += m.tradeStats?.teamSmokeCovered || 0;
      totalRevCount += m.tradeStats?.revCount || 0;
      totalBaitCount += m.tradeStats?.baitCount || 0;

      // 4. 골든 타임 및 킬 기여도
      if (m.goldenTimeDamage && (m.survivalTimeSec || 0) >= 600) {
        goldenTime.early += m.goldenTimeDamage.early;
        goldenTime.mid1 += m.goldenTimeDamage.mid1;
        goldenTime.mid2 += m.goldenTimeDamage.mid2;
        goldenTime.late += m.goldenTimeDamage.late;
        goldenTimeMatchCount++;
      }
      if (m.killContribution) {
        killContrib.solo += m.killContribution.solo;
        killContrib.cleanup += m.killContribution.cleanup;
        killContrib.other += m.killContribution.other;
      }
      if (m.combatPressure?.utilityHits) {
        totalUtilityHits += m.combatPressure.utilityHits;
      }
      if (m.bluezoneWasteCount) bluezoneWasteMatches++;
    });

    const mainMapSize = sizeCounts["Large"] >= sizeCounts["Small"] ? "Large" : "Small";
    const userInitiativeRate = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.initiativeSuccessRate || m.initiativeStats?.rate || 0), 0) / detailedMatches.length);
    const totalTradeAttempts = totalSuppCount + totalSmokeCount + totalRevCount;

    const hasGoldenTimeData = Object.values(goldenTime).some(v => v > 0);

    const avgDeathDistanceStr = deathDistanceCount > 0 ? `${Math.round(totalDeathDistanceSum / deathDistanceCount)}m` : "측정 불가";
    const avgBackupLatency = backupLatencies.length > 0 
      ? (backupLatencies.reduce((a, b) => a + b, 0) / backupLatencies.length / 1000).toFixed(2) + "s" 
      : (totalTeammateKnocks === 0 ? "상황 없음" : "측정 불가");
    const avgReactionLatency = reactionLatencies.length > 0 
      ? (reactionLatencies.reduce((a, b) => a + b, 0) / reactionLatencies.length / 1000).toFixed(2) + "s" 
      : "N/A";

    let avgBaselineDamageFinal = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.eliteBenchmark?.avgDamage || 0), 0) / detailedMatches.length);
    let avgBaselineKillsFinal = Number((detailedMatches.reduce((acc: number, m: any) => acc + (m.eliteBenchmark?.avgKills || 0), 0) / detailedMatches.length).toFixed(1));
    
    // [V2.1] 실시간 엘리트 벤치마크 로드 (20건 이상 쌓였을 때만 활성화)
    const { data: globalStats } = await supabase
      .from("global_benchmarks")
      .select("latency_ms, initiative_rate, team_distance, revive_rate, smoke_rate, supp_count, team_wipes, utility_count, survival_time, solo_kill_rate, burst_damage, damage, kills, map_name")
      .not("game_mode", "ilike", "%tdm%")
      .not("game_mode", "ilike", "%event%");
    
    let avgRealTradeLatencyFinal = (detailedMatches.reduce((acc: number, m: any) => acc + (m.eliteBenchmark?.realTradeLatency || 800), 0) / detailedMatches.length / 1000).toFixed(2);
    let avgRealInitiativeSuccessFinal = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.eliteBenchmark?.realInitiativeSuccess || 50), 0) / detailedMatches.length);
    let avgRealDeathDistanceFinal = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.eliteBenchmark?.realDeathDistance || 30), 0) / detailedMatches.length);
    let avgRealTeamWipesFinal = Number((detailedMatches.reduce((acc: number, m: any) => acc + (m.eliteBenchmark?.realTeamWipes || 1.5), 0) / detailedMatches.length).toFixed(1));

    let avgRealReviveRateFinal = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.eliteBenchmark?.realReviveRate || 80), 0) / detailedMatches.length);
    let avgRealSmokeRateFinal = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.eliteBenchmark?.realSmokeRate || 60), 0) / detailedMatches.length);
    let avgRealSuppCountFinal = Number((detailedMatches.reduce((acc: number, m: any) => acc + (m.eliteBenchmark?.realSuppCount || 3), 0) / detailedMatches.length).toFixed(1));

    // [V5.35] 신규 지표 초기값 (랭커 기준)
    let avgRealUtilityCountFinal = 2.5; 
    let avgRealSurvivalTimeFinal = 1200;
    let avgRealSoloKillRateFinal = 45;
    let avgRealBurstDamageFinal = 150;

    if (globalStats && globalStats.length >= 20) {
      // [V5.41] 맵 크기별(Large/Small) 벤치마크 필터링
      let targetStats = globalStats;
      const sizeSpecific = globalStats.filter(s => getMapSizeCategory(s.map_name || "") === mainMapSize);
      
      if (sizeSpecific.length >= 20) {
        targetStats = sizeSpecific;
        console.log(`[AI-SUMMARY] Synced with ${mainMapSize}-Size Benchmarks (n=${sizeSpecific.length})`);
      } else {
        console.log(`[AI-SUMMARY] Fallback to Global Benchmarks (Size ${mainMapSize} only has ${sizeSpecific.length} samples)`);
      }

      const validLatency = targetStats.filter(s => (s.latency_ms || 0) > 0);
      if (validLatency.length > 0) {
        avgRealTradeLatencyFinal = (validLatency.reduce((acc, s) => acc + s.latency_ms, 0) / validLatency.length / 1000).toFixed(2);
      }
      
      // [V5.36] 기본 지표 및 전술 지표 통합 갱신
      avgBaselineDamageFinal = Math.round(targetStats.reduce((acc, s) => acc + (s.damage || 0), 0) / targetStats.length);
      avgBaselineKillsFinal = Number((targetStats.reduce((acc, s) => acc + (s.kills || 0), 0) / targetStats.length).toFixed(1));
      avgRealInitiativeSuccessFinal = Math.round(targetStats.reduce((acc, s) => acc + (s.initiative_rate || 50), 0) / targetStats.length);
      avgRealDeathDistanceFinal = Math.round(targetStats.reduce((acc, s) => acc + (s.team_distance || 30), 0) / targetStats.length);
      avgRealReviveRateFinal = Math.round(targetStats.reduce((acc, s) => acc + (s.revive_rate || 80), 0) / targetStats.length);
      avgRealSmokeRateFinal = Math.round(targetStats.reduce((acc, s) => acc + (s.smoke_rate || 60), 0) / targetStats.length);
      avgRealSuppCountFinal = Number((targetStats.reduce((acc, s) => acc + (s.supp_count || 3), 0) / targetStats.length).toFixed(1));
      avgRealTeamWipesFinal = Number((targetStats.reduce((acc, s) => acc + (s.team_wipes || 1), 0) / targetStats.length).toFixed(1));
      avgRealUtilityCountFinal = Number((targetStats.reduce((acc, s) => acc + (s.utility_count || 0), 0) / targetStats.length).toFixed(1));
      avgRealSurvivalTimeFinal = Math.round(targetStats.reduce((acc, s) => acc + (s.survival_time || 0), 0) / targetStats.length);
      avgRealSoloKillRateFinal = Math.round(targetStats.reduce((acc, s) => acc + (s.solo_kill_rate || 0), 0) / targetStats.length);
      avgRealBurstDamageFinal = Math.min(avgBaselineDamageFinal, Math.round(targetStats.reduce((acc, s) => acc + (s.burst_damage || 0), 0) / targetStats.length));
    }    


    const avgTradeSuccessRate = totalTeammateKnocks > 0 ? Math.round((totalTradeAttempts / totalTeammateKnocks) * 100) : 0;
    const userAvgDist = deathDistanceCount > 0 ? Math.round(totalDeathDistanceSum / deathDistanceCount) : 30;

    const metrics = [
      { key: "initiative", gap: avgRealInitiativeSuccessFinal - userInitiativeRate, label: "선제 타격 효율", hint: `실제 성공률 ${userInitiativeRate}% (권장 ${avgRealInitiativeSuccessFinal}%)` },
      { key: "suppression", gap: avgRealSuppCountFinal - (totalSuppCount / detailedMatches.length), label: "견제 사격 지원", hint: `평균 ${ (totalSuppCount / detailedMatches.length).toFixed(1) }회 (상위권 ${avgRealSuppCountFinal}회)` },
      { key: "smoke", gap: avgRealSmokeRateFinal - (totalTeammateKnocks > 0 ? Math.round((totalSmokeCount / totalTeammateKnocks) * 100) : 0), label: "연막 세이브 확률", hint: `성공률 ${ totalTeammateKnocks > 0 ? Math.round((totalSmokeCount / totalTeammateKnocks) * 100) : 0 }% (권장 ${avgRealSmokeRateFinal}%)` },
      { key: "revive", gap: avgRealReviveRateFinal - (totalTeammateKnocks > 0 ? Math.round((totalRevCount / totalTeammateKnocks) * 100) : 0), label: "부활 기여도", hint: `직접 부활 ${ totalTeammateKnocks > 0 ? Math.round((totalRevCount / totalTeammateKnocks) * 100) : 0 }% (권장 ${avgRealReviveRateFinal}%)` },
      { key: "distance", gap: userAvgDist - avgRealDeathDistanceFinal, label: "팀워크 및 거리", hint: `평균 거리 ${userAvgDist}m (상위권 ${avgRealDeathDistanceFinal}m)` },
      { key: "wipe", gap: (avgRealTeamWipesFinal - (totalEnemyTeamWipes / detailedMatches.length)) * 20, label: "전술적 몰살", hint: `팀 전멸 기여 ${totalEnemyTeamWipes}회 (상위권 ${avgRealTeamWipesFinal}회 이상 참여)` },
      { key: "damage", gap: (avgBaselineDamageFinal - avgDamage) / 5, label: "전술적 화력 효율", hint: `평균 딜량 ${avgDamage} (Benchmark ${avgBaselineDamageFinal})` },
      ...(totalTeammateKnocks > 0 ? [{ 
        key: "trade", gap: 70 - avgTradeSuccessRate, label: "전술 대응력", 
        hint: `전술 대응력 ${avgTradeSuccessRate}% (권장 70%)` 
      }] : [])
    ];
    
    // [V5.07] 딜량 지표는 전술의 핵심이므로 항상 포함하고, 나머지는 Gap 순위로 선정
    const damageMetric = metrics.find(m => m.key === "damage")!;
    const otherMetrics = metrics.filter(m => m.key !== "damage")
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 3);
    
    const top4Issues = [damageMetric, ...otherMetrics].filter(Boolean);
    
    const issueGuides = top4Issues.map((issue, idx) => {
      const type = issue.gap > 0 ? "약점" : "강점";
      return `${idx + 1}. (${type}) ${issue.label}: ${issue.hint}`;
    }).join("\n");

    let rankedCount = 0;
    let normalCount = 0;
    detailedMatches.forEach((m: any) => {
      const isRankedMatch = m.matchType === 'competitive' || (m.gameMode || "").includes("competitive");
      if (isRankedMatch) rankedCount++;
      else normalCount++;
    });
    const mainMode = rankedCount >= normalCount ? "경쟁전" : "일반전";

    const promptLines = [
      "당신들은 PUBG 전술 분석 데스크의 두 전문 코치입니다. 주어진 유저의 최근 10경기 V5.0 전술 데이터(Tactical Analytics)를 바탕으로, 단순한 수치 나열이 아닌 '상황적 맥락'과 '전술적 판단'에 대한 심도 있는 끝장 토론을 진행하십시오.",
      "",
      "[코치 페르소나 설정]",
      "1. KIND COACH (전술적 옹호자 & 멘탈 케어):",
      "   - 유저의 플레이에 숨겨진 '이타적 헌신'과 '전술적 의도'를 찾아냅니다.",
      "   - 킬/데스와 같은 표면적 결과보다 연막 투척, 견제 사격, 부활 시도 등 V5.0 지표를 근거로 칭찬합니다.",
      "   - SPICY의 비판을 수용하되, \"하지만 그 상황에선 최선의 선택이었습니다\"라며 데이터를 기반으로 방어합니다.",
      "2. SPICY BOMBER (냉혹한 실적주의 분석가):",
      "   - [부활 억까 방지 규칙] 유저의 연막 지원(Smoke)이나 견제 사격(Suppression) 횟수가 엘리트 평균 이상이라면, 부활(Revive) 수치가 낮다는 이유로 '심각', '치명적', '낙제점' 같은 극단적인 부정 단어를 사용하는 것을 절대 금지합니다.",
      "   - 위 상황에서는 SPICY조차도 \"직접 부활보다 화력 지원을 택한 전술적 판단은 인정하지만, 결과적으로 팀원이 확킬난 점은 아쉽다\" 정도로 톤을 낮춰야 합니다.",
      "   - 직접 부활(Revive)은 10초간 무방비 상태가 되는 '최후의 수단'입니다. 아군 기절 시 유저가 적을 압박(Suppression)하거나 연막(Smoke)으로 시야를 가렸다면, 이는 직접 부활보다 훨씬 뛰어난 '전술적 보호'로 평가하십시오.",
      "   - 아군이 기절했을 때 유저가 '무엇'을 했는지(연막 투척, 견제 사격, 백업 딜링)를 종합적으로 보고, 아무런 전술적 대응(Response)이 없었을 때만 날카롭게 비판하십시오.",
      "   - \"구급상자\" 같은 초보적인 비유는 절대 금지하며, '부활(Revive)', '트레이드(Trade)', '백업 사격' 등 전문 전술 용어만 사용하십시오.",
      "   - \"부활을 안 한 게 문제가 아니라, 그 시간에 적을 압박하거나 연막을 치지 못해 전술적 공백을 만든 게 실책입니다\"처럼 전술적 공백을 찌르는 비판을 하십시오.",
      "",
      "[토론 전개 및 대화형 구조 규칙 (매우 중요)]",
      "- '독백'은 절대 금지됩니다. 두 코치의 의견은 반드시 핑퐁(Ping-pong)처럼 이어져야 합니다.",
      "- SPICY가 먼저 문제점을 날카롭게 찌르면(spicyOpinion), KIND가 SPICY의 논리를 직접 언급(\"SPICY 코치님 말씀도 맞지만...\")하며 반박하는(kindOpinion) 흐름을 만드십시오.",
      "- 모든 주장은 반드시 하단에 제공된 [분석 데이터]의 숫자를 명시적으로 인용해야 합니다. (예: \"견제 사격을 5회나...\")",
      "",
      "- '부활 성공률'이 낮더라도 '견제 사격(Suppression)'이나 '연막 세이브(Smoke Save)' 횟수가 충분하다면, 이는 '직접 구호' 대신 '능동적 엄호'를 선택한 프로급 판단으로 칭찬하십시오. 이 경우 '팀워크 부족'으로 비난하는 것은 절대 금지이며, 오히려 SPICY가 \"부활보다 사격 지원을 택한 판단이 옳았다\"고 인정해야 합니다.",
      "- 모든 수치는 상호 연관되어 있습니다. 예를 들어 '팀원 거리'가 가깝고 '부활 기여도'만 낮다면 '내가 최전방에서 교전하느라 부활할 틈이 없었거나, 아군을 대신해 적을 먼저 제압했기 때문'이라는 점을 반드시 고려하십시오.",
      "- '백업 사격(Backup Latency)'이 느린데 부활 수치까지 낮다면 그것은 비판의 대상이지만, 백업이 빠르고 연막 활용이 좋다면 부활 수치는 부차적인 것으로 취급하십시오.",
      "",
      "[이번 분석의 핵심 쟁점 - 반드시 아래 4가지 주제로 다룰 것]",
      issueGuides,
      "",
      "[데이터 대칭성 및 라벨링 규칙 (CRITICAL)]",
      "- userStats와 benchmarkStats는 반드시 동일한 개수, 동일한 순서, 동일한 라벨(label)을 가져야 합니다.",
      "- 예: userStats[0]이 '직접 부활'이면, benchmarkStats[0]도 반드시 '직접 부활'이어야 하며 단위도 일치해야 합니다.",
      "- 모든 수치 비교는 'Apple-to-Apple'이어야 하며, 하나라도 어긋나면 전술 분석 데이터로서 무효입니다.",
      "- '견제 사격 성공률'이라는 명칭 대신 반드시 '견제 지원 사격 강도'를 사용하십시오.",
      "",
      "[승패(Winner) 판정 및 평가(Evaluation) 가이드라인]",
      "- 무승부(draw): 유저의 지표가 벤치마크와 거의 일치하거나, 의도는 좋았으나 결과가 아쉬울 때. 두 코치가 서로 한 발씩 양보하며 결론을 냅니다.",
      "- KIND 승리(kind): 유저의 전술적 지표(연막, 견제, 부활)나 반응 속도가 상위권 기준을 상회할 때. SPICY 교관도 수긍해야 합니다.",
      "- SPICY 승리(spicy): 유저의 지표가 벤치마크에 심각하게 미달할 때. 핑계의 여지가 없는 치명적 실수일 경우.",
      "- evaluation(최종 평가): 두 코치의 논쟁을 하나로 요약하고, 해당 주제에 대한 유저의 '현재 상태 진단'을 한 문장으로 명확히 정리하십시오.",
      "",
      "[데이터 벤치마크 (Global Elite Standard)]",
      `- 상위권 반격 속도(Backup): ${avgRealTradeLatencyFinal}초 이내`,
      `- 상위권 선제 타격 효율: ${avgRealInitiativeSuccessFinal}% 이상`,
      `- 상위권 평균 팀원 거리: ${avgRealDeathDistanceFinal}m 내외`,
      `- 상위권 투척물 명중(Utility): ${avgRealUtilityCountFinal}회`,
      `- 상위권 순수 킬비중(Solo Kill): ${avgRealSoloKillRateFinal}%`,
      `- 상위권 교전 폭발력(Burst Damage): ${avgRealBurstDamageFinal}`,
      `- 상위권 팀 전멸 기여(Wipe): ${avgRealTeamWipesFinal}회`,
      `- 상위권 견제 지원 사격 강도: ${avgRealSuppCountFinal}회 (위험 상황 당 압박 횟수)`,
      "",
      "반드시 아래 구조의 JSON 객체로만 응답하세요. 백틱(```)이나 추가 텍스트 없이 순수 JSON만 출력하십시오.",
      "{",
      '  "visuals": {',
      '    "latency": { "backup": "0.00s", "opportunity": "아군 기절 상황 횟수 (예: 14회)" }',
      '  },',
      '  "signature": "유저의 플레이 스타일을 관통하는 칭호 (예: 칠흑의 연막 마에스트로)",',
      '  "signatureSub": "해당 칭호를 부여한 전술적 이유 (1문장)",',
      '  "debateIssues": [',
      "    {",
      '      "topic": "쟁점의 핵심 키워드",',
      '      "question": "토론의 화두가 되는 날카로운 질문",',
      '      "spicyOpinion": "상위권 지표와 비교하여 문제점을 짚어내는 SPICY의 차가운 독설",',
      '      "kindOpinion": "KIND의 따뜻한 반박",',
      '      "winner": "kind | spicy | draw",',
      '      "reason": "판정 이유 (데이터 기반 1문장)",',
      '      "evaluation": "종합적인 개선 방향",',
      '      "userStats": [ { "label": "라벨A", "value": "유저값" }, { "label": "라벨B", "value": "유저값" } ],',
      '      "benchmarkStats": [ { "label": "라벨A", "value": "상위권값" }, { "label": "라벨B", "value": "상위권값" } ]',
      "    }",
      "  ],",
      '  "finalVerdict": "유저의 최근 10경기에 대한 총평",',
      '  "actionItems": [',
      '    { "icon": "🎯", "title": "훈련 목표", "desc": "실전 팁" }',
      "  ]",
      "}"
    ];

    const finalPrompt = promptLines.join("\n");
    const userPrompt = `
- [분석 대상] 최근 10경기 중 경쟁전 ${rankedCount}판, 일반전 ${normalCount}판 (주요 모드: ${mainMode})
- 평균 화력: 10경기 평균 딜량 ${avgDamage} (엘리트 벤치마크: ${avgBaselineDamageFinal}), 평균 ${avgKills}킬
- 전술 기여: 견제 사격 ${totalSuppCount}회, 연막 세이브 ${totalSmokeCount}회, 직접 부활 ${totalRevCount}회, 전술 대응 ${totalBaitCount}회, 투척물 명중 ${(totalUtilityHits / detailedMatches.length).toFixed(1)}회
- [실측] 선제 공격 시도: ${detailedMatches.reduce((acc: number, m: any) => acc + (m.initiativeStats?.total || 0), 0)}회, 성공률: ${userInitiativeRate}% (Benchmark: ${avgRealInitiativeSuccessFinal}%)
- [실측] 평균 반응 속도(Reaction): ${avgReactionLatency} (피격 시 반격 시간)
- [실측] 평균 커버 속도(Backup): ${avgBackupLatency} (아군 기절 시 지원 시간)
- [V5.35] 화력 정밀 분석: 교전 폭발력(Burst) ${goldenTimeMatchCount > 0 ? Math.round(Math.min(avgDamage, (goldenTime.early + goldenTime.mid1 + goldenTime.mid2 + goldenTime.late) / goldenTimeMatchCount)) : 0} (Benchmark: ${avgRealBurstDamageFinal}), 순수 킬 비중 ${totalKills > 0 ? Math.round((killContrib.solo / totalKills) * 100) : 0}% (Benchmark: ${avgRealSoloKillRateFinal}%)
- [V5.35] 리스크 분석: 팀 전멸 기여(Wipes) ${(totalEnemyTeamWipes / detailedMatches.length).toFixed(1)}회 (Benchmark: ${avgRealTeamWipesFinal}회), 평균 생존 시간 ${Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.survivalTimeSec || 0), 0) / detailedMatches.length / 60)}분
- 팀원 거리: 평균 ${userAvgDist}m (Elite: ${avgRealDeathDistanceFinal}m)
- 아군 기절 총 횟수: ${totalTeammateKnocks}회 (이 중 ${totalSuppCount + totalSmokeCount + totalRevCount}회 전술적 대응 완료)
- 트레이드 커버 권장 속도: ${avgRealTradeLatencyFinal}s 미만 (현재 유저: ${avgBackupLatency})
`;

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const modelsToTry = [
      "gemini-3.1-flash-lite-preview",
      "gemini-3-flash-preview",
      "gemini-2.5-flash-lite",
      "gemma-3-27b"
    ];
    
    // [V3.0] 세이프티 설정 추가 (독설 코칭 스타일 허용)
    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ];

    let fullText = "";
    for (const modelName of modelsToTry) {
      try {
        console.log(`[AI-SUMMARY] Attempting with ${modelName}...`);
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: { responseMimeType: "application/json" },
          safetySettings
        });
        const response = await model.generateContent(finalPrompt + "\n\n" + userPrompt);
        fullText = response.response.text();
        if (fullText) break;
      } catch (err: any) { 
        console.warn(`[AI-SUMMARY] ${modelName} failed:`, err.message);
        continue; 
      }
    }

    if (!fullText) throw new Error("AI 응답 실패");

    try {
      let cleanJson = fullText.trim();
      const startIdx = cleanJson.indexOf("{");
      let braceCount = 0, endIdx = -1;
      for (let i = startIdx; i < cleanJson.length; i++) {
        if (cleanJson[i] === "{") braceCount++;
        else if (cleanJson[i] === "}") braceCount--;
        if (braceCount === 0) { endIdx = i; break; }
      }
      cleanJson = cleanJson.substring(startIdx, endIdx + 1);
      const parsed = JSON.parse(cleanJson);
      
      // [V5.07] 서버 실측 시각화 및 데이터 보정 로직 복구
      if (!parsed.visuals) parsed.visuals = {};
      if (!parsed.visuals.latency) parsed.visuals.latency = {};
      
      // 실측 데이터 강제 주입 (AI 누락 방지)
      parsed.visuals.latency.backup = avgBackupLatency;
      parsed.visuals.latency.opportunity = `아군 기절 상황 ${totalTeammateKnocks}회`;
      
      const latestMatchTime = detailedMatches.length > 0 
        ? new Date(Math.max(...detailedMatches.map((m: any) => new Date(m.createdAt).getTime()))).toISOString() 
        : new Date().toISOString();

      const precomputedVisuals = {
        ...parsed.visuals,
        latestMatchTime,
        backupLatency: avgBackupLatency,
        reactionLatency: avgReactionLatency,
        initiativeSuccess: !isNaN(userInitiativeRate) ? `${userInitiativeRate}%` : "0%",
        goldenTime: goldenTimeMatchCount > 0 ? {
          early: Math.round(goldenTime.early / goldenTimeMatchCount),
          mid1: Math.round(goldenTime.mid1 / goldenTimeMatchCount),
          mid2: Math.round(goldenTime.mid2 / goldenTimeMatchCount),
          late: Math.round(goldenTime.late / goldenTimeMatchCount)
        } : null,
        killContrib,
        bluezoneWaste: bluezoneWasteMatches,
        tactical: {
          suppRate: totalDangerousKnocks > 0 ? Math.round((totalSuppCount / totalDangerousKnocks) * 100) + "%" : "0%",
          smokeRate: totalSmokeOpps > 0 ? Math.round((totalSmokeCount / totalSmokeOpps) * 100) + "%" : "0%",
          reviveRate: totalTeammateKnocks > 0 ? Math.round((totalRevCount / totalTeammateKnocks) * 100) + "%" : "0%",
          baitCount: totalBaitCount,
          teamSmokeCovered: totalTeamSmokeCovered,
          utilityHits: totalUtilityHits,
          avgWipes: Number((totalEnemyTeamWipes / detailedMatches.length).toFixed(1)),
          soloKillRate: totalKills > 0 ? Math.round((killContrib.solo / totalKills) * 100) : 0,
          burstDamage: goldenTimeMatchCount > 0 ? Math.round(Math.min(avgDamage, (goldenTime.early + goldenTime.mid1 + goldenTime.mid2 + goldenTime.late) / goldenTimeMatchCount)) : 0,
          benchmarks: {
            utility: avgRealUtilityCountFinal,
            wipes: avgRealTeamWipesFinal,
            soloKill: avgRealSoloKillRateFinal,
            burst: avgRealBurstDamageFinal
          },
          suppRaw: { count: totalSuppCount, total: totalDangerousKnocks },
          smokeRaw: { count: totalSmokeCount, total: totalSmokeOpps, teamCover: totalTeamSmokeCovered },
          reviveRaw: { count: totalRevCount, total: totalTeammateKnocks }
        }
      };

      return NextResponse.json({
        ...parsed,
        visuals: {
          ...precomputedVisuals,
          modeDistribution: { ranked: rankedCount, normal: normalCount, main: mainMode }
        }
      });
    } catch (e) {
      console.error("[AI-SUMMARY] Parse Error:", e, fullText);
      // 파싱 실패 시 텍스트라도 응답 (폴백)
      return new Response(fullText, { headers: { "Content-Type": "text/plain" } });
    }

  } catch (error: any) {
    console.error("[AI-SUMMARY] Global Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
