import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "../../../../lib/supabase";

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

    const cachedMap = new Map();
    if (cachedMatches) {
      cachedMatches.forEach(m => {
        const fullResult = (m.data as any)?.fullResult;
        if (fullResult && fullResult.v >= 30) cachedMap.set(m.match_id, fullResult);
      });
    }
    
    console.log(`[AI-SUMMARY] Cache Hit: ${cachedMap.size} / 10`);
    
    // 미분석 매치 처리 (V29 버전으로 새로 분석)
    const targetMatchIds = matchIds.slice(0, 10);
    const missingMatchIds = targetMatchIds.filter((id: string) => !cachedMap.has(id));
    const newResultsMap = new Map();
    
    if (missingMatchIds.length > 0) {
      console.log(`[AI-SUMMARY] ⚡ Parallel analyzing ${missingMatchIds.length} matches...`);
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      
      // Promise.all을 사용하여 병렬 처리 (속도 10배 향상)
      await Promise.all(missingMatchIds.map(async (id: string) => {
        try {
          const res = await fetch(`${baseUrl}/api/pubg/match?matchId=${id}&nickname=${nickname}&platform=${platform}`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.v >= 29) {
              newResultsMap.set(id, data);
            }
          }
        } catch (e) {
          console.error(`[AI-SUMMARY] Error analyzing ${id}:`, e);
        }
      }));
      console.log(`[AI-SUMMARY] ⚡ All missing matches analyzed.`);
    }

    const detailedMatches = targetMatchIds.map((id: string) => cachedMap.get(id) || newResultsMap.get(id)).filter(Boolean);
    console.log(`[AI-SUMMARY] Total analyzed matches for summary: ${detailedMatches.length}`);
    if (detailedMatches.length === 0) {
      return NextResponse.json({ error: "최신 분석 데이터(V29)를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 400 });
    }

    // 데이터 집계
    const totalKills = detailedMatches.reduce((acc: number, m: any) => acc + (m.stats?.kills || 0), 0);
    const totalDamage = detailedMatches.reduce((acc: number, m: any) => acc + (m.stats?.damageDealt || 0), 0);
    const avgDamage = Math.floor(totalDamage / detailedMatches.length);
    
    const totalSmokesUsed = detailedMatches.reduce((acc: number, m: any) => acc + (m.itemUseDetails || []).filter((i: any) => i.itemId?.includes("SmokeBomb") && normalizeName(i.playerName) === lowerNickname).length, 0);
    const totalFragsUsed = detailedMatches.reduce((acc: number, m: any) => acc + (m.itemUseDetails || []).filter((i: any) => i.itemId?.includes("Grenade") && normalizeName(i.playerName) === lowerNickname).length, 0);
    
    let totalDeathDistanceSum = 0;
    let deathDistanceCount = 0;
    const tradeLatencies: number[] = [];
    let teamWipeMatches = 0;
    const allWipeTimelines: any[] = [];

    detailedMatches.forEach((m: any) => {
      if (m.teammateDistancesAtDeath) {
        const distances = Object.values(m.teammateDistancesAtDeath) as number[];
        if (distances.length > 0) {
          totalDeathDistanceSum += Math.min(...distances);
          deathDistanceCount++;
        }
      }
      if (m.teamWipeOccurred) {
        teamWipeMatches++;
        if (m.wipeTimeline) allWipeTimelines.push(m.wipeTimeline);
      }
      if (m.avgTradeLatency) tradeLatencies.push(m.avgTradeLatency);
    });

    let totalTeammateKnocks = 0;
    let totalTradeAttempts = 0;
    detailedMatches.forEach((m: any) => {
      const teamwork = m.detailedTeamwork || [];
      teamwork.forEach((tw: any) => {
        if (!tw.isVictimMe) { 
          totalTeammateKnocks++;
          if (tw.userActivityAtTime?.dealtDamageToFoe > 0 || tw.userActivityAtTime?.hasKnockOrKill) {
            totalTradeAttempts++;
          }
        }
      });
    });
    const avgTradeSuccessRate = totalTeammateKnocks > 0 ? Math.round((totalTradeAttempts / totalTeammateKnocks) * 100) : 0;
    const totalInitiativeLosses = detailedMatches.reduce((acc: number, m: any) => acc + (m.initiativeLossCount || 0), 0);
    
    const goldenTime = { early: 0, mid1: 0, mid2: 0, late: 0 };
    const killContrib = { solo: 0, cleanup: 0, other: 0 };
    let bluezoneWasteMatches = 0;

    detailedMatches.forEach((m: any) => {
      if (m.goldenTimeDamage) {
        goldenTime.early += m.goldenTimeDamage.early;
        goldenTime.mid1 += m.goldenTimeDamage.mid1;
        goldenTime.mid2 += m.goldenTimeDamage.mid2;
        goldenTime.late += m.goldenTimeDamage.late;
      }
      if (m.killContribution) {
        killContrib.solo += m.killContribution.solo;
        killContrib.cleanup += m.killContribution.cleanup;
        killContrib.other += m.killContribution.other;
      }
      if (m.bluezoneWasteCount) bluezoneWasteMatches++;
    });

    const avgDeathDistanceStr = deathDistanceCount > 0 ? `${Math.round(totalDeathDistanceSum / deathDistanceCount)}m` : "측정 불가";
    const avgTradeLatencyStr = tradeLatencies.length > 0 ? `${(tradeLatencies.reduce((a, b) => a + b, 0) / tradeLatencies.length / 1000).toFixed(2)}초` : "데이터 부족";

    const avgBaselineDamageFinal = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.top10Baseline?.avgDamage || 0), 0) / detailedMatches.length);
    const avgBaselineKillsFinal = Number((detailedMatches.reduce((acc: number, m: any) => acc + (m.top10Baseline?.avgKills || 0), 0) / detailedMatches.length).toFixed(1));
    const avgRealTradeLatencyFinal = (detailedMatches.reduce((acc: number, m: any) => acc + (m.top10Baseline?.realTradeLatency || 800), 0) / detailedMatches.length / 1000).toFixed(2);
    const avgRealInitiativeSuccessFinal = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.top10Baseline?.realInitiativeSuccess || 50), 0) / detailedMatches.length);
    const avgRealDeathDistanceFinal = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.top10Baseline?.realDeathDistance || 30), 0) / detailedMatches.length);

    const userInitiativeRate = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.initiativeSuccessRate || 0), 0) / detailedMatches.length);
    const userAvgDist = deathDistanceCount > 0 ? Math.round(totalDeathDistanceSum / deathDistanceCount) : 30;
    const userLatency = tradeLatencies.length > 0 ? (tradeLatencies.reduce((a, b) => a + b, 0) / tradeLatencies.length / 1000) : 1.5;

    const metrics = [
      { key: "initiative", gap: avgRealInitiativeSuccessFinal - userInitiativeRate, label: "선제 타격 효율", hint: `성공률 ${userInitiativeRate}% (상위권 ${avgRealInitiativeSuccessFinal}%)` },
      { key: "trade", gap: 70 - avgTradeSuccessRate, label: "복수 성공률", hint: `트레이드 시도율 ${avgTradeSuccessRate}% (상위권 권장 70%)` },
      { key: "distance", gap: userAvgDist - avgRealDeathDistanceFinal, label: "팀워크 및 거리", hint: `평균 거리 ${userAvgDist}m (상위권 ${avgRealDeathDistanceFinal}m)` },
      { key: "wipe", gap: (teamWipeMatches - 2) * 20, label: "전술적 몰살", hint: `10경기 중 ${teamWipeMatches}회 발생 (상위권 2회 미만)` },
      { key: "latency", gap: (userLatency - parseFloat(avgRealTradeLatencyFinal)) * 50, label: "교전 반응 속도", hint: `반응 속도 ${userLatency.toFixed(2)}초 (상위권 ${avgRealTradeLatencyFinal}초)` },
    ];

    const sortedByGap = [...metrics].sort((a, b) => b.gap - a.gap); 
    const weaknesses = sortedByGap.slice(0, 2); 
    const strength = sortedByGap.reverse().find(m => !weaknesses.find(w => w.key === m.key)) || sortedByGap[0]; 
    
    const top3Issues = [...weaknesses, strength];

    const modeCounts: Record<string, number> = {};
    detailedMatches.forEach((m: any) => { modeCounts[m.gameMode || "squad"] = (modeCounts[m.gameMode || "squad"] || 0) + 1; });
    const mainMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "squad";

    const promptLines = [
      "당신은 PUBG 전문 분석가 팀입니다. 두 명의 코치가 [" + mainMode + "] 모드 데이터를 바탕으로 유저의 최근 10경기 데이터를 정밀 토론합니다.",
      "",
      "[게임 모드별 분석 가이드라인]",
      "- 현재 주요 모드: " + mainMode,
      "- solo인 경우: 팀워크 관련 비판 절대 금지. 대신 개인의 샷각, 자기장 진입, 1v1 승률, 선제 타격 효율에 집중.",
      "- duo 또는 squad인 경우: 팀원과의 거리, 커버 속도, 연쇄 사망(Tactical Wipe) 원인 분석 포함.",
      "",
      "[코치 페르소나]",
      "1. 😊 KIND COACH: 유저의 생존 의지와 보이지 않는 기여를 높게 평가합니다. 선제 타격 후 기절하지 않았다면 견제 사격의 의미를 높게 삽니다.",
      "2. ⚡ SPICY BOMBER: 수치와 팩트 기반으로 비판합니다. 특히 '먼저 쏘고도 역으로 기절당한(Loss)' 사례가 있다면 샷의 질과 판단력을 강하게 질타하십시오.",
      "",
      "[V24 리얼 데이터 벤치마크 지침]",
      "AI는 이제 추측이 아닌 제공된 데이터 내의 '리얼 상위권 지표'를 실제 표준으로 사용하십시오.",
      "- 리얼 상위권 반격 속도: " + avgRealTradeLatencyFinal + "초",
      "- 리얼 상위권 선제 타격 성공률: " + avgRealInitiativeSuccessFinal + "%",
      "- 리얼 상위권 권장 복수(Trade) 성공률: 70% 이상",
      "- 리얼 상위권 평균 팀원 거리: " + avgRealDeathDistanceFinal + "m",
      "- 상위권 권장 몰살 횟수: 10경기 중 2회 미만",
      "- AI는 위 수치들을 '상위권 평균'의 절대적 근거로 삼아 토론을 진행하십시오.",
      "",
      "[이번 분석의 핵심 쟁점 - 반드시 아래 3가지를 다룰 것]",
      `1. ${top3Issues[0].label} (데이터: ${top3Issues[0].hint})`,
      `2. ${top3Issues[1].label} (데이터: ${top3Issues[1].hint})`,
      `3. [강점] ${top3Issues[2].label} (데이터: ${top3Issues[2].hint}) - ※ 이 주제는 유저의 명백한 강점입니다. 착한 코치가 주접에 가까운 극찬을 쏟아내게 하세요.`,
      "",
      "[토론 및 판정 가이드]",
      "- winner 필드는 'KIND', 'SPICY', 'DRAW' 중 하나여야 합니다.",
      "- 유저의 수치가 Benchmark와 오차범위 5% 이내로 비슷하다면 반드시 'DRAW'를 선언하십시오.",
      "- 3번째 [강점] 주제에서는 가급적 'KIND' 혹은 'DRAW'가 나오도록 유도하십시오.",
      "",
      "반드시 아래 구조의 JSON 객체로 응답하세요 (순수 JSON만 출력).",
      "중요: debateIssues는 반드시 정확히 3개를 도출해야 합니다.",
      "{",
      '  "signature": "유저의 가장 뛰어난 능력을 상징하는 한 문장 별명 (예: 0.1초의 반격술사, 엔딩 요정 등)",',
      '  "signatureSub": "위 타이틀의 근거가 되는 실측 데이터 기반 설명 (예: 평균 딜량 450 및 헤드샷율 25%로 상위 5% 플레이어의 지표에 도달했습니다.)",',
      '  "debateIssues": [',
      "    {",
      '      "topic": "주제 키워드",',
      '      "question": "핵심 질문",',
      '      "kindOpinion": "착한 코치의 주장",',
      '      "spicyOpinion": "매운맛 코치의 팩트 폭격",',
      '      "winner": "kind | spicy | draw",',
      '      "userStats": [{ "label": "항목명", "value": "수치" }],',
      '      "benchmarkStats": [{ "label": "항목명", "value": "수치" }]',
      "    }",
      "  ],",
      '  "finalVerdict": "전체적인 평가 총평 (따뜻하게 또는 매섭게)",',
      '  "actionItems": [',
      '    { "icon": "🎯", "title": "구체적 지침", "desc": "실행 가능한 조언" }',
      "  ],",
      '  "visuals": {',
      `    "tradeLatency": "${userLatency.toFixed(2)}s",`,
      `    "initiativeSuccess": "${userInitiativeRate}%",`,
      '    "goldenTime": { "early": ' + goldenTime.early + ', "mid1": ' + goldenTime.mid1 + ', "mid2": ' + goldenTime.mid2 + ', "late": ' + goldenTime.late + ' },',
      '    "killContrib": { "solo": ' + killContrib.solo + ', "cleanup": ' + killContrib.cleanup + ' },',
      '    "bluezoneWaste": ' + bluezoneWasteMatches,
      '  }',
      "}"
    ];

    const finalPrompt = promptLines.join("\n");
    const userPrompt = `
### 📊 분석 데이터 및 코칭 가이드
- 선제 공격 시도: ${detailedMatches.reduce((acc: number, m: any) => acc + (m.totalInitiatives || 0), 0)}회, 성공률: ${userInitiativeRate}% (상위권: ${avgRealInitiativeSuccessFinal}%)
- 복수(Trade) 시도: ${totalTradeAttempts}회 / 아군 기절 총 ${totalTeammateKnocks}회, 시도율: ${avgTradeSuccessRate}% (상위권: 70% 이상)
- 교전 반응: 평균 반격 속도 ${userLatency.toFixed(2)}초 (상위권: ${avgRealTradeLatencyFinal}초)
- [V29 신규] 골든 타임 분석: 0-5분(${goldenTime.early}), 5-15분(${goldenTime.mid1}), 15-25분(${goldenTime.mid2}), 25분+(${goldenTime.late})
- [V29 신규] 킬 기여도: 솔로킬(${killContrib.solo}), 클린업(${killContrib.cleanup})
- [V29 신규] 블루존 낭비: 10경기 중 ${bluezoneWasteMatches}회
- 리스크: 전술적 몰살 ${teamWipeMatches}회, 평균 팀원 거리 ${userAvgDist}m (상위권: ${avgRealDeathDistanceFinal}m)

위 데이터를 바탕으로 JSON 토론 보고서를 생성하세요.
`;

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const modelsToTry = ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-2.0-flash"];
    
    let result = null;
    let successModel = "";

    for (const modelName of modelsToTry) {
      try {
        console.log(`[AI-SUMMARY] Trying model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        result = await model.generateContentStream(finalPrompt + "\n\n" + userPrompt);
        successModel = modelName;
        break; 
      } catch (err) {
        console.warn(`[AI-SUMMARY] Model ${modelName} failed, trying next...`);
      }
    }

    if (!result) throw new Error("All AI models failed to respond.");
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of (result as any).stream) {
            const chunkText = chunk.text();
            if (chunkText) controller.enqueue(new TextEncoder().encode(chunkText));
          }
          controller.close();
        } catch (err) { 
          controller.error(err); 
        }
      },
    });

    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
