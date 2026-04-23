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

    const cachedMap = new Map();
    if (cachedMatches) {
      cachedMatches.forEach(m => {
        const fullResult = (m.data as any)?.fullResult;
        if (fullResult && fullResult.v >= 2.0) cachedMap.set(m.match_id, fullResult);
      });
    }
    
    console.log(`[AI-SUMMARY] Cache Hit: ${cachedMap.size} / 10`);
    
    // 미분석 매치 처리
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
            if (data && data.v >= 44) {
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
      return NextResponse.json({ error: "최신 분석 데이터(2.0)를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 400 });
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
      // [V52] tradeLatencyMs 필드 우선 참조
      if (m.tradeStats?.tradeLatencyMs && m.tradeStats.tradeLatencyMs > 0) tradeLatencies.push(m.tradeStats.tradeLatencyMs);
      else if (m.tradeLatency && m.tradeLatency > 0) tradeLatencies.push(m.tradeLatency);
      else if (m.avgTradeLatencyMs && m.avgTradeLatencyMs > 0) tradeLatencies.push(m.avgTradeLatencyMs);
    });

    let totalTeammateKnocks = 0;
    let totalTradeAttempts = 0;
    detailedMatches.forEach((m: any) => {
      totalTeammateKnocks += m.tradeStats?.teammateKnocks || 0;
      totalTradeAttempts += m.tradeStats?.userCoverAttempts || 0;
    });
    const userInitiativeRate = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.initiativeSuccessRate || m.initiativeStats?.rate || 0), 0) / detailedMatches.length);
    const totalInitiativeLosses = detailedMatches.reduce((acc: number, m: any) => acc + ((m.initiativeStats?.total || 0) - (m.initiativeStats?.success || 0)), 0);
    
    const goldenTime = { early: 0, mid1: 0, mid2: 0, late: 0 };
    const killContrib = { solo: 0, cleanup: 0, other: 0 };
    let bluezoneWasteMatches = 0;

    detailedMatches.forEach((m: any) => {
      // [V37] 생존 시간이 10분(600초) 미만인 경기는 골든 타임 집계에서 제외 (지표 왜곡 방지)
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

    const hasGoldenTimeData = Object.values(goldenTime).some(v => v > 0);

    const avgDeathDistanceStr = deathDistanceCount > 0 ? `${Math.round(totalDeathDistanceSum / deathDistanceCount)}m` : "측정 불가";
    const avgTradeLatencyStr = tradeLatencies.length > 0 ? `${(tradeLatencies.reduce((a, b) => a + b, 0) / tradeLatencies.length / 1000).toFixed(2)}초` : "데이터 부족";

    const avgBaselineDamageFinal = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.top10Baseline?.avgDamage || 0), 0) / detailedMatches.length);
    const avgBaselineKillsFinal = Number((detailedMatches.reduce((acc: number, m: any) => acc + (m.top10Baseline?.avgKills || 0), 0) / detailedMatches.length).toFixed(1));
    const avgRealTradeLatencyFinal = (detailedMatches.reduce((acc: number, m: any) => acc + (m.top10Baseline?.realTradeLatency || 800), 0) / detailedMatches.length / 1000).toFixed(2);
    const avgRealInitiativeSuccessFinal = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.top10Baseline?.realInitiativeSuccess || 50), 0) / detailedMatches.length);
    const avgRealDeathDistanceFinal = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.top10Baseline?.realDeathDistance || 30), 0) / detailedMatches.length);

    const avgTradeSuccessRate = totalTeammateKnocks > 0 ? Math.round((totalTradeAttempts / totalTeammateKnocks) * 100) : 0;
    const userAvgDist = deathDistanceCount > 0 ? Math.round(totalDeathDistanceSum / deathDistanceCount) : 30;
    const userLatency = tradeLatencies.length > 0 ? (tradeLatencies.reduce((a, b) => a + b, 0) / tradeLatencies.length / 1000) : null;

    const metrics = [
      { key: "initiative", gap: avgRealInitiativeSuccessFinal - userInitiativeRate, label: "선제 타격 효율", hint: `실제 성공률 ${userInitiativeRate}% (권장 ${avgRealInitiativeSuccessFinal}%)` },
      // [V42 개선] 데이터가 있을 때만 지표 후보에 포함
      ...(totalTeammateKnocks > 0 ? [{ 
        key: "trade", gap: 70 - avgTradeSuccessRate, label: "복수 성공률", 
        hint: `트레이드 성공률 ${avgTradeSuccessRate}% (권장 70%)` 
      }] : []),
      { key: "distance", gap: userAvgDist - avgRealDeathDistanceFinal, label: "팀워크 및 거리", hint: `평균 거리 ${userAvgDist}m (상위권 ${avgRealDeathDistanceFinal}m)` },
      { key: "wipe", gap: (teamWipeMatches - 2) * 20, label: "전술적 몰살", hint: `실제 발생 ${teamWipeMatches}회 (상위권 2회 미만)` },
      ...(userLatency !== null ? [{
        key: "latency", 
        gap: (userLatency - parseFloat(avgRealTradeLatencyFinal)) * 50, 
        label: "교전 반응 속도", 
        hint: `실제 속도 ${userLatency.toFixed(2)}초 (상위권 ${avgRealTradeLatencyFinal}초)`
      }] : [])
    ];
    
    const sorted = [...metrics].sort((a, b) => b.gap - a.gap);
    const weaknesses = sorted.slice(0, 2);
    
    // [V37] 실제 강점(gap < 0)이 있는 경우만 선정, 없으면 '개선 가능성'으로 전환
    const strengthCandidate = [...metrics]
      .sort((a, b) => a.gap - b.gap)
      .find(m => m.gap < 0 && !weaknesses.find(w => w.key === m.key));

    const top3Issues = strengthCandidate 
      ? [...weaknesses, strengthCandidate] 
      : [...weaknesses, { ...sorted[2], label: `${sorted[2].label} (개선 가능성)`, hint: sorted[2].hint }];

    const thirdIssueGuide = strengthCandidate
      ? `3. (강점) ${top3Issues[2].label}: ${top3Issues[2].hint} - KIND 코치가 극찬하십시오.`
      : `3. (개선 가능성) ${top3Issues[2].label}: ${top3Issues[2].hint} - 두 코치 모두 "여기서부터 시작하면 된다"는 희망적 논조로 마무리하십시오.`;

    const modeCounts: Record<string, number> = {};
    detailedMatches.forEach((m: any) => { modeCounts[m.gameMode || "squad"] = (modeCounts[m.gameMode || "squad"] || 0) + 1; });
    const mainMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "squad";

    const promptLines = [
      "당신은 PUBG 전문 분석가 팀입니다. 두 명의 코치가 [" + mainMode + "] 모드 데이터를 바탕으로 유저의 최근 10경기 데이터를 정밀 토론합니다. 이 과정은 상호 비방과 데이터에 기반한 논리적 공방으로 진행되며, 최종 응답은 반드시 지정된 JSON 포맷만 출력해야 합니다. JSON 블록 앞뒤에 절대 어떠한 설명이나 인삿말도 붙이지 마십시오.",
      "",
      "[토론 구조 강화 규칙 - '독백 금지']",
      "- 'KIND COACH'와 'SPICY BOMBER'는 서로의 주장을 경청하고 반박하는 '대화형 토론'을 진행해야 합니다.",
      "- kindOpinion은 반드시 spicyOpinion의 핵심 비판을 직접 인용하고 반박하는 문장으로 시작하십시오.",
      "- spicyOpinion은 kindOpinion이 제시할 법한 '변명'을 선제적으로 차단하고 팩트로 압박하십시오.",
      "- 두 코치 모두 '그러나', '반면에', '그건 오산입니다' 같은 반박 접속사를 반드시 사용하십시오.",
      "- 각 의견은 최소 3문장 이상이어야 하며, 마지막 문장은 상대방에 대한 직접 질문으로 끝나야 합니다.",
      "",
      "[winner 판정 기준 - 상벌 명확]",
      "- 유저 수치가 벤치마크 대비 10% 이상 낮으면 (약점): spicy가 승리하여 날카롭게 비판하십시오.",
      "- 유저 수치가 벤치마크 대비 5% 이내로 비슷하면: draw로 판정하여 팽팽한 논쟁을 벌이십시오.",
      "- 유저 수치가 벤치마크 대비 10% 이상 높으면 (강점): kind가 승리하여 유저의 기량을 확실히 치하하고 성취감을 주십시오.",
      "- 특히 3번째 [강점] 주제에서는 수치가 우수하다면 망설임 없이 'kind'를 승자로 선택하여 칭찬의 효과를 극대화하십시오.",
      "- winner는 반드시 소문자 'kind', 'spicy', 'draw' 중 하나만 사용하십시오.",
      "",
      "[Signature 생성 공식]",
      "- 형식: '[피크 시간대] [무기/교전 스타일] [특이 패턴]의 [별명]'",
      "- 예시: '후반 저격의 그림자, 엔딩 클린업 전문가'",
      "- 금지어: '신중한 전술가', '생존의 달인', '팀의 버팀목' 등 진부한 표현 절대 금지.",
      "",
      "[데이터 벤치마크 (업계 평균 추정치)]",
      "- 상위권 반격 속도: " + avgRealTradeLatencyFinal + "초 (업계 추정치, 실측 준비 중)",
      "- 상위권 선제 타격 성공률: " + avgRealInitiativeSuccessFinal + "% (실측값)",
      "- 상위권 평균 팀원 거리: " + avgRealDeathDistanceFinal + "m (실측값)",
      "- 상위권 권장 몰살 횟수: 10경기 중 2회 미만",
      "",
      "[이번 분석의 핵심 쟁점 - 반드시 아래 3가지 순서로 다룰 것]",
      `1. (약점) ${top3Issues[0].label}: ${top3Issues[0].hint}`,
      `   → SPICY: 역관광 ${totalInitiativeLosses}회 등 실측 수치로 압박하십시오.`,
      `   → KIND: 시도 횟수 자체가 적극적인 교전 의지임을 방어 논거로 쓰십시오.`,
      "2. (약점) " + top3Issues[1].label + ": " + top3Issues[1].hint,
      thirdIssueGuide,
      "",
      "반드시 아래 구조의 JSON 객체로 응답하세요.",
      "{",
      '  "signature": "유니크한 마스터리 타이틀",',
      '  "signatureSub": "실측 데이터 기반의 플레이 스타일 정의",',
      '  "debateIssues": [',
      "    {",
      '      "topic": "주제",',
      '      "question": "핵심 질문",',
      '      "kindOpinion": "반박으로 시작하는 옹호",',
      '      "spicyOpinion": "허점을 찌르는 팩트 폭격",',
      '      "winner": "kind | spicy | draw",',
      '      "userStats": [{ "label": "항목", "value": "수치" }],',
      '      "benchmarkStats": [{ "label": "항목(업계평균추정)", "value": "수치" }]',
      "    }",
      "  ],",
      '  "finalVerdict": "최종 판결",',
      '  "actionItems": [{ "icon": "🎯", "title": "지침", "desc": "조언" }]'
    ];

    const finalPrompt = promptLines.join("\n");
    const userPrompt = `
### 📊 분석 데이터 및 코칭 가이드
- [실측] 선제 공격 시도: ${detailedMatches.reduce((acc: number, m: any) => acc + (m.initiativeStats?.total || 0), 0)}회, 성공률: ${userInitiativeRate}% (벤치마크: ${avgRealInitiativeSuccessFinal}%)
- [실측] 복수(Trade) 성공: ${totalTradeAttempts}회 / 기회(아군 기절): ${totalTeammateKnocks}회 (성공률 ${avgTradeSuccessRate}%) (권장: 70%)
- [실측] 평균 반격 속도: ${userLatency !== null ? `${userLatency.toFixed(2)}초` : "데이터 부족"} (상위권: ${avgRealTradeLatencyFinal}초)
- [V37] 골든 타임 분석 (10분 이상 생존 매치 합산): 0-5분(${goldenTime.early}), 5-15분(${goldenTime.mid1}), 15-25분(${goldenTime.mid2}), 25분+(${goldenTime.late})
- [V37] 킬 기여도: 솔로킬(${killContrib.solo}), 클린업(${killContrib.cleanup})
- [V37] 블루존 낭비: 10경기 중 ${bluezoneWasteMatches}회
- 리스크: 전술적 몰살 ${teamWipeMatches}회, 평균 팀원 거리 ${userAvgDist}m (상위권: ${avgRealDeathDistanceFinal}m)

위 데이터를 바탕으로 JSON 토론 보고서를 생성하세요.
`;

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const modelsToTry = [
      "gemini-3.1-flash-lite-preview", 
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite", 
      "gemini-2.5-pro",
    ];
    
    let fullText = "";
    let activeModelName = "";

    for (const modelName of modelsToTry) {
      try {
        console.log(`[AI-SUMMARY] 🤖 Trying model: ${modelName}`);
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ],
          generationConfig: {
            responseMimeType: "application/json",
          }
        });
        
        console.log(`[AI-SUMMARY] 📡 Requesting content from ${modelName}...`);
        // 스트리밍 파싱 에러를 방지하기 위해 단일 응답으로 시도하며, 루프 내에서 대기함
        const response = await model.generateContent(finalPrompt + "\n\n" + userPrompt);
        fullText = response.response.text();
        
        if (fullText) {
          activeModelName = modelName;
          console.log(`[AI-SUMMARY] ✅ Model ${modelName} responded successfully.`);
          break; 
        }
      } catch (err: any) {
        console.error(`[AI-SUMMARY] ❌ Model ${modelName} failed:`, err.message || err);
        console.warn(`[AI-SUMMARY] 🔄 Switching to next available model...`);
        continue;
      }
    }

    if (!fullText) {
      throw new Error("모든 AI 모델이 응답에 실패했습니다. API 키 또는 할당량을 확인해주세요.");
    }

    // [V37] 헤더 데이터 안전 정제 (NaN 방지 및 HTTP 헤더 내 한글 사용 금지)
    const safeLatency = (userLatency !== null && !isNaN(userLatency)) ? `${userLatency.toFixed(2)}s` : "N/A";
    const safeInitiative = !isNaN(userInitiativeRate) ? `${userInitiativeRate}%` : "0%";
    
    try {
      let cleanJson = fullText.trim();
      
      const startIdx = cleanJson.indexOf("{");
      if (startIdx === -1) throw new Error("유효한 JSON 구조를 찾을 수 없습니다.");
      
      // [V44 개선] 첫 번째 { 와 짝이 맞는 } 를 찾아서 정확히 객체만 추출
      let endIdx = -1;
      let braceCount = 0;
      for (let i = startIdx; i < cleanJson.length; i++) {
        if (cleanJson[i] === "{") braceCount++;
        else if (cleanJson[i] === "}") braceCount--;
        
        if (braceCount === 0) {
          endIdx = i;
          break;
        }
      }
      
      if (endIdx === -1) throw new Error("닫는 괄호를 찾을 수 없습니다.");
      cleanJson = cleanJson.substring(startIdx, endIdx + 1);
      
      const parsed = JSON.parse(cleanJson);
      
      // [V42] 서버 실측 시각화 데이터 준비
      const precomputedVisuals = {
        tradeLatency: safeLatency,
        initiativeSuccess: safeInitiative,
        goldenTime: hasGoldenTimeData ? goldenTime : null,
        killContrib,
        bluezoneWaste: bluezoneWasteMatches
      };

      // 서버에서 계산한 실측 데이터를 JSON 바디에 직접 삽입 (유저 제안 반영)
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
