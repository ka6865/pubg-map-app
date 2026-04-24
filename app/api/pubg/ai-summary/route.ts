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
    const cachedMap: Map<string, any> = new Map();
    if (cachedMatches) {
      cachedMatches.forEach(m => {
        const fullResult = (m.data as any)?.fullResult;
        if (fullResult && fullResult.v >= 4.9) cachedMap.set(m.match_id, fullResult);
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
              if (data && data.v >= 4.9) {
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
    
    // [V37] itemUseSummary 활용
    const totalSmokesUsed = detailedMatches.reduce((acc: number, m: any) => acc + (m.itemUseSummary?.smokes || 0), 0);
    const totalFragsUsed = detailedMatches.reduce((acc: number, m: any) => acc + (m.itemUseSummary?.frags || 0), 0);
    
    let totalDeathDistanceSum = 0;
    let deathDistanceCount = 0;
    const backupLatencies: number[] = [];
    const reactionLatencies: number[] = [];
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
      
      // [V2.3] 커버(Backup) 및 반응(Reaction) 속도 집계
      if (m.tradeStats?.backupLatencyMs && m.tradeStats.backupLatencyMs > 0) {
        backupLatencies.push(m.tradeStats.backupLatencyMs);
      } else if (m.tradeStats?.tradeLatencyMs && m.tradeStats.tradeLatencyMs > 0) {
        // 하위 호환성 유지
        backupLatencies.push(m.tradeStats.tradeLatencyMs);
      }

      if (m.tradeStats?.reactionLatencyMs && m.tradeStats.reactionLatencyMs > 0) {
        reactionLatencies.push(m.tradeStats.reactionLatencyMs);
      }
    });

    let totalTeammateKnocks = 0, totalSuppCount = 0, totalSmokeCount = 0, totalRevCount = 0, totalBaitCount = 0;
    let totalDangerousKnocks = 0, totalSmokeOpps = 0, totalTeamSmokeCovered = 0;
    const goldenTime = { early: 0, mid1: 0, mid2: 0, late: 0 };
    const killContrib = { solo: 0, cleanup: 0, other: 0 };
    let bluezoneWasteMatches = 0;

    detailedMatches.forEach((m: any) => {
      // [V3.0] 전술 지표 집계
      totalTeammateKnocks += m.tradeStats?.teammateKnocks || 0;
      totalDangerousKnocks += m.tradeStats?.dangerousKnocks ?? m.tradeStats?.teammateKnocks ?? 0;
      totalSuppCount += m.tradeStats?.suppCount || 0;
      // smokeOpps는 dangerousKnocks와 동일 (위험 상황 전체가 연막 기회)
      totalSmokeOpps += m.tradeStats?.smokeOpps ?? m.tradeStats?.dangerousKnocks ?? m.tradeStats?.teammateKnocks ?? 0;
      totalSmokeCount += m.tradeStats?.smokeCount || 0;
      totalTeamSmokeCovered += m.tradeStats?.teamSmokeCovered || 0;
      totalRevCount += m.tradeStats?.revCount || 0;
      totalBaitCount += m.tradeStats?.baitCount || 0;

      // [V37] 골든 타임 및 킬 기여도
      if (m.goldenTimeDamage && (m.survivalTimeSec || 0) >= 600) {
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

    const userInitiativeRate = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.initiativeSuccessRate || m.initiativeStats?.rate || 0), 0) / detailedMatches.length);
    const totalTradeAttempts = totalSuppCount + totalSmokeCount + totalRevCount;

    const hasGoldenTimeData = Object.values(goldenTime).some(v => v > 0);

    const avgDeathDistanceStr = deathDistanceCount > 0 ? `${Math.round(totalDeathDistanceSum / deathDistanceCount)}m` : "측정 불가";
    const avgBackupLatency = backupLatencies.length > 0 
      ? (backupLatencies.reduce((a, b) => a + b, 0) / backupLatencies.length / 1000).toFixed(2) + "s" 
      : "N/A";
    const avgReactionLatency = reactionLatencies.length > 0 
      ? (reactionLatencies.reduce((a, b) => a + b, 0) / reactionLatencies.length / 1000).toFixed(2) + "s" 
      : "N/A";

    const avgBaselineDamageFinal = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.top10Baseline?.avgDamage || 0), 0) / detailedMatches.length);
    const avgBaselineKillsFinal = Number((detailedMatches.reduce((acc: number, m: any) => acc + (m.top10Baseline?.avgKills || 0), 0) / detailedMatches.length).toFixed(1));
    
    // [V2.1] 실시간 엘리트 벤치마크 로드 (20건 이상 쌓였을 때만 활성화)
    const { data: globalStats } = await supabase.from("global_benchmarks").select("latency_ms, initiative_rate, team_distance");
    
    let avgRealTradeLatencyFinal = (detailedMatches.reduce((acc: number, m: any) => acc + (m.top10Baseline?.realTradeLatency || 800), 0) / detailedMatches.length / 1000).toFixed(2);
    let avgRealInitiativeSuccessFinal = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.top10Baseline?.realInitiativeSuccess || 50), 0) / detailedMatches.length);
    let avgRealDeathDistanceFinal = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.top10Baseline?.realDeathDistance || 30), 0) / detailedMatches.length);

    if (globalStats && globalStats.length >= 20) {
      const validLatency = globalStats.filter(s => (s.latency_ms || 0) > 0);
      if (validLatency.length > 0) {
        avgRealTradeLatencyFinal = (validLatency.reduce((acc, s) => acc + s.latency_ms, 0) / validLatency.length / 1000).toFixed(2);
      }
      avgRealInitiativeSuccessFinal = Math.round(globalStats.reduce((acc, s) => acc + (s.initiative_rate || 50), 0) / globalStats.length);
      avgRealDeathDistanceFinal = Math.round(globalStats.reduce((acc, s) => acc + (s.team_distance || 30), 0) / globalStats.length);
      console.log(`[AI-SUMMARY] Using Global Benchmarks (n=${globalStats.length})`);
    }

    const avgTradeSuccessRate = totalTeammateKnocks > 0 ? Math.round((totalTradeAttempts / totalTeammateKnocks) * 100) : 0;
    const userAvgDist = deathDistanceCount > 0 ? Math.round(totalDeathDistanceSum / deathDistanceCount) : 30;

    const metrics = [
      { key: "initiative", gap: avgRealInitiativeSuccessFinal - userInitiativeRate, label: "선제 타격 효율", hint: `실제 성공률 ${userInitiativeRate}% (권장 ${avgRealInitiativeSuccessFinal}%)` },
      { key: "suppression", gap: 3 - (totalSuppCount / detailedMatches.length), label: "견제 사격 지원", hint: `평균 ${ (totalSuppCount / detailedMatches.length).toFixed(1) }회 (상위권 3회 이상)` },
      { key: "smoke", gap: 60 - (totalTeammateKnocks > 0 ? Math.round((totalSmokeCount / totalTeammateKnocks) * 100) : 0), label: "연막 세이브 확률", hint: `성공률 ${ totalTeammateKnocks > 0 ? Math.round((totalSmokeCount / totalTeammateKnocks) * 100) : 0 }% (권장 60%)` },
      { key: "revive", gap: 80 - (totalTeammateKnocks > 0 ? Math.round((totalRevCount / totalTeammateKnocks) * 100) : 0), label: "부활 기여도", hint: `직접 부활 ${ totalTeammateKnocks > 0 ? Math.round((totalRevCount / totalTeammateKnocks) * 100) : 0 }% (권장 80%)` },
      { key: "distance", gap: userAvgDist - avgRealDeathDistanceFinal, label: "팀워크 및 거리", hint: `평균 거리 ${userAvgDist}m (상위권 ${avgRealDeathDistanceFinal}m)` },
      { key: "wipe", gap: (teamWipeMatches - 2) * 20, label: "전술적 몰살", hint: `실제 발생 ${teamWipeMatches}회 (상위권 2회 미만)` },
      ...(totalTeammateKnocks > 0 ? [{ 
        key: "trade", gap: 70 - avgTradeSuccessRate, label: "복수 성공률", 
        hint: `트레이드 성공률 ${avgTradeSuccessRate}% (권장 70%)` 
      }] : [])
    ];
    
    const sortedByGap = [...metrics].sort((a, b) => b.gap - a.gap);
    const weaknesses = sortedByGap.slice(0, 2);
    
    const strengths = [...metrics]
      .filter(m => !weaknesses.some(w => w.key === m.key))
      .sort((a, b) => a.gap - b.gap)
      .slice(0, 2);

    const top4Issues = [...weaknesses, ...strengths];

    const issueGuides = top4Issues.map((issue, idx) => {
      const type = issue.gap > 0 ? "약점" : "강점";
      return `${idx + 1}. (${type}) ${issue.label}: ${issue.hint}`;
    }).join("\n");

    const modeCounts: Record<string, number> = {};
    detailedMatches.forEach((m: any) => { modeCounts[m.gameMode || "squad"] = (modeCounts[m.gameMode || "squad"] || 0) + 1; });
    const mainMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "squad";

    const promptLines = [
      "당신은 PUBG 전문 분석가 팀입니다. 두 명의 코치가 [" + mainMode + "] 모드 데이터를 바탕으로 유저의 최근 10경기 데이터를 정밀 토론합니다. 이 과정은 상호 비방과 데이터에 기반한 논리적 공방으로 진행되며, 최종 응답은 반드시 지정된 JSON 포맷만 출력해야 합니다.",
      "",
      "[토론 구조 강화 규칙 - '독백 금지']",
      "- 'KIND COACH'와 'SPICY BOMBER'는 서로의 주장을 경청하고 반박하는 '대화형 토론'을 진행해야 합니다.",
      "- kindOpinion은 반드시 spicyOpinion의 핵심 비판을 직접 인용하고 반박하는 문장으로 시작하십시오.",
      "- spicyOpinion은 팩트로 유저를 압박하며 독설을 아끼지 마십시오.",
      "- 두 코치 모두 '그러나', '반면에', '그건 오산입니다' 같은 반박 접속사를 반드시 사용하십시오.",
      "",
      "[데이터 벤치마크 (상위권 평균)]",
      `- 상위권 반격 속도(Backup): ${avgRealTradeLatencyFinal}초`,
      `- 상위권 선제 타격 성공률: ${avgRealInitiativeSuccessFinal}%`,
      `- 상위권 평균 팀원 거리: ${avgRealDeathDistanceFinal}m`,
      "",
      "[이번 분석의 핵심 쟁점 - 반드시 아래 4가지 주제로 다룰 것]",
      issueGuides,
      "",
      "반드시 아래 구조의 JSON 객체로 응답하세요.",
      "{",
      '  "signature": "유니크한 마스터리 타이틀",',
      '  "signatureSub": "플레이 스타일 정의",',
      '  "debateIssues": [',
      "    {",
      '      "topic": "주제",',
      '      "question": "핵심 질문",',
      '      "kindOpinion": "반박으로 시작하는 옹호",',
      '      "spicyOpinion": "허점을 찌르는 팩트 폭격",',
      '      "winner": "kind | spicy | tie 중 선택. (중요: 유저 수치가 벤치마크와 일치하거나 더 우수하면 반드시 tie 또는 kind를 선택할 것. 억지 비난 금지)",',
      '      "reason": "판정 이유 (데이터에 기반하여 1문장으로 작성)",',
      '      "evaluation": "전체적인 요약 및 향후 훈련 방향 (다정한 코치와 독설 교관이 합의한 최종 결론)",',
      '      "userStats": [{ "label": "항목", "value": "수치", "detail": "예: 3/5회 또는 N/A" }],',
      '      "benchmarkStats": [{ "label": "항목(업계평균)", "value": "수치", "detail": "예: 권장값 또는 N/A" }]',
      "    }",
      "  ],",
      "[판정 가이드라인]",
      "1. 데이터가 상위권 벤치마크보다 우수할 경우(예: 몰살 0회, 거리 30m 유지 등), 독설 교관의 '억지 비난'은 절대 승리할 수 없습니다. 이 경우 반드시 'kind' 승리 또는 'tie' 판정을 내리십시오.",
      "2. '매운맛'의 논리가 아무리 화려해도 수치적 팩트(Benchmark 달성 여부)를 이길 수 없습니다. 수치가 증명한다면 다정한 코치의 칭찬이 정답입니다.",
      "3. 'spicy' 판정은 유저의 지표가 벤치마크에 미달하여 명백한 개선이 필요할 때만 제한적으로 사용하십시오.",
      "4. 수치가 벤치마크와 완벽히 일치하면 무조건 'tie' 판정을 내리십시오.",
      "",
      '  "finalVerdict": "최종 판결",',
      '  "actionItems": [{ "icon": "🎯", "title": "지침", "desc": "조언" }]'
    ];

    const finalPrompt = promptLines.join("\n");
    const userPrompt = `
### 📊 분석 데이터 및 코칭 가이드
- [V3.0 전술 기여] 견제 사격: ${totalSuppCount}회, 연막 세이브: ${totalSmokeCount}회, 직접 부활: ${totalRevCount}회, 복수/미끼 성공: ${totalBaitCount}회
- [실측] 선제 공격 시도: ${detailedMatches.reduce((acc: number, m: any) => acc + (m.initiativeStats?.total || 0), 0)}회, 성공률: ${userInitiativeRate}% (벤치마크: ${avgRealInitiativeSuccessFinal}%)
- [실측] 평균 반응 속도(Reaction): ${avgReactionLatency} (피격 시 반격 시간)
- [실측] 평균 커버 속도(Backup): ${avgBackupLatency} (아군 기절 시 지원 시간)
- [V3.0] 골든 타임 분석: 0-5분(${goldenTime.early}), 5-15분(${goldenTime.mid1}), 15-25분(${goldenTime.mid2}), 25분+(${goldenTime.late})
- [V3.0] 킬 기여도: 솔로킬(${killContrib.solo}), 클린업(${killContrib.cleanup})
- [V3.0] 블루존 낭비: 10경기 중 ${bluezoneWasteMatches}회
- 리스크: 전술적 몰살 ${teamWipeMatches}회, 평균 팀원 거리 ${userAvgDist}m (상위권: ${avgRealDeathDistanceFinal}m)
- 아군 기절 총 횟수: ${totalTeammateKnocks}회 (이 중 ${totalSuppCount + totalSmokeCount + totalRevCount}회 전술적 대응 완료)
- 트레이드 커버 속도: ${avgBackupLatency} (권장: 1.8s 미만)
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
      
      // [V3.0] 서버 실측 시각화 데이터 준비
      const precomputedVisuals = {
        backupLatency: avgBackupLatency,
        reactionLatency: avgReactionLatency,
        initiativeSuccess: !isNaN(userInitiativeRate) ? `${userInitiativeRate}%` : "0%",
        goldenTime: Object.values(goldenTime).some(v => v > 0) ? goldenTime : null,
        killContrib,
        bluezoneWaste: bluezoneWasteMatches,
        tactical: {
          suppRate: totalDangerousKnocks > 0 ? Math.round((totalSuppCount / totalDangerousKnocks) * 100) + "%" : "0%",
          smokeRate: totalSmokeOpps > 0 ? Math.round((totalSmokeCount / totalSmokeOpps) * 100) + "%" : "0%",
          reviveRate: totalTeammateKnocks > 0 ? Math.round((totalRevCount / totalTeammateKnocks) * 100) + "%" : "0%",
          baitCount: totalBaitCount,
          teamSmokeCovered: totalTeamSmokeCovered,
          suppRaw: { count: totalSuppCount, total: totalDangerousKnocks },
          smokeRaw: { count: totalSmokeCount, total: totalSmokeOpps, teamCover: totalTeamSmokeCovered },
          reviveRaw: { count: totalRevCount, total: totalTeammateKnocks }
        }
      };

      const finalData = {
        ...parsed,
        visuals: precomputedVisuals
      };

      return NextResponse.json(finalData);
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
