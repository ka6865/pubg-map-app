import { NextResponse } from "next/server";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { supabase } from "../../../../lib/supabase";

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
        if (fullResult && fullResult.v >= 8.2) cachedMap.set(m.match_id, fullResult);
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

    let totalKills = 0, totalDamage = 0, totalDamageImpact = 0;
    const allBadges: any[] = [];
    
    detailedMatches.forEach((m: any) => {
      totalKills += (m.stats?.kills || 0);
      totalDamage += (m.stats?.damageDealt || 0);
      totalDamageImpact += (m.teamImpact?.damageImpact || 0);
      if (m.badges) allBadges.push(...m.badges);
    });

    const mLen = Math.max(1, detailedMatches.length);
    const avgDamage = Math.floor(totalDamage / mLen);
    const avgKills = Number((totalKills / mLen).toFixed(1));
    const avgDamageImpact = Number((totalDamageImpact / mLen).toFixed(1));
    
    const badgeCounts: Record<string, number> = {};
    allBadges.forEach((b: any) => { if (b?.name) badgeCounts[b.name] = (badgeCounts[b.name] || 0) + 1; });
    const topBadges = Object.entries(badgeCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => `${name}(${count}회)`).join(", ");

    let totalTeammateKnocks = 0, totalSuppCount = 0, totalSmokeCount = 0, totalRevCount = 0, totalBaitCount = 0, totalCoverRateSum = 0;
    let totalCrossfireCount = 0;
    const backupLatencies: number[] = [], reactionLatencies: number[] = [];
    
    detailedMatches.forEach((m: any) => {
      if (m.tradeStats) {
        totalTeammateKnocks += m.tradeStats.teammateKnocks || 0;
        totalSuppCount += m.tradeStats.suppCount || 0;
        totalSmokeCount += m.tradeStats.smokeCount || 0;
        totalRevCount += m.tradeStats.revCount || 0;
        totalBaitCount += m.tradeStats.baitCount || 0;
        totalCoverRateSum += m.tradeStats.coverRate || 0;
        if (m.tradeStats.counterLatencyMs > 0) backupLatencies.push(m.tradeStats.counterLatencyMs);
        if (m.tradeStats.reactionLatencyMs > 0) reactionLatencies.push(m.tradeStats.reactionLatencyMs);
      }
      if (m.isolationData) { 
        if (m.isolationData.isCrossfire) totalCrossfireCount++; 
      }
    });

    const userInitiativeRate = Math.round(detailedMatches.reduce((acc: number, m: any) => acc + (m.initiative_rate || 0), 0) / mLen);
    const avgBackupLatency = backupLatencies.length > 0 ? (backupLatencies.reduce((a, b) => a + b, 0) / backupLatencies.length / 1000).toFixed(2) + "s" : "측정 불가";
    const avgReactionLatency = reactionLatencies.length > 0 ? (reactionLatencies.reduce((a, b) => a + b, 0) / reactionLatencies.length / 1000).toFixed(2) + "s" : "N/A";
    const avgCoverRate = Math.round(totalCoverRateSum / mLen);

    const { data: globalStats } = await supabase.from("global_benchmarks").select("*").not("game_mode", "ilike", "%tdm%");
    let avgRealInitiativeSuccessFinal = 55, avgRealPressureFinal = 1.5, avgBaselineDamageFinal = 450;
    let b_isolationIndex = 1.0, b_minDist = 15, b_counterLatency = 0.5, b_soloKillRate = 50, b_reviveRate = 30;
    
    if (globalStats && globalStats.length >= 5) {
      const len = globalStats.length;
      avgRealPressureFinal = Number((globalStats.reduce((acc, s) => acc + (s.pressure_index || 0), 0) / len).toFixed(2));
      avgBaselineDamageFinal = Math.round(globalStats.reduce((acc, s) => acc + (s.damage || 0), 0) / len);
      avgRealInitiativeSuccessFinal = Math.round(globalStats.reduce((acc, s) => acc + (s.initiative_rate || 0), 0) / len);
      b_isolationIndex = Number((globalStats.reduce((acc, s) => acc + (s.isolation_index || 0), 0) / len).toFixed(2));
      b_minDist = Math.round(globalStats.reduce((acc, s) => acc + (s.min_dist || 0), 0) / len);
      b_counterLatency = Number((globalStats.reduce((acc, s) => acc + (s.counter_latency_ms || 0), 0) / len / 1000).toFixed(2));
      b_soloKillRate = Math.round(globalStats.reduce((acc, s) => acc + (s.solo_kill_rate || 0), 0) / len);
      b_reviveRate = Math.round(globalStats.reduce((acc, s) => acc + (s.revive_rate || 0), 0) / len);
    }

    const matchTimes = detailedMatches.map((m: any) => {
      const d = new Date(m.createdAt || Date.now());
      return isNaN(d.getTime()) ? Date.now() : d.getTime();
    });
    const latestMatchTime = matchTimes.length > 0 ? new Date(Math.max(...matchTimes)).toISOString() : new Date().toISOString();
    const avgPressureIndex = Number((detailedMatches.reduce((acc: number, m: any) => acc + (m.combatPressure?.pressureIndex || 0), 0) / mLen).toFixed(2));

    // [V7.4] ① goldenTime/killContrib/isolation 집계 루프 (promptLines/userPrompt보다 반드시 먼저)
    const goldenTimeFinal = { early: 0, mid1: 0, mid2: 0, late: 0 };
    const killContribFinal = { solo: 0, cleanup: 0 };
    let totalIsolationIndexFinal = 0, isolationCountFinal = 0, totalMinDist = 0, totalHeightDiff = 0, totalTeammateCountFinal = 0;
    let totalBluezoneWaste = 0;

    detailedMatches.forEach((m: any) => {
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
      if (m.isolationData) {
        totalIsolationIndexFinal += (m.isolationData.isolationIndex || 0);
        totalMinDist += (m.isolationData.minDist || 0);
        totalHeightDiff += (m.isolationData.heightDiff || 0);
        totalTeammateCountFinal += (m.isolationData.teammateCount || 1);
        isolationCountFinal++;
      }
      totalBluezoneWaste += (m.bluezoneWaste || 0);
    });

    // [V7.4] ② 집계 결과 기반 파생 지표 계산
    const goldenTimeAvg = {
      early: Math.round(goldenTimeFinal.early / mLen),
      mid1: Math.round(goldenTimeFinal.mid1 / mLen),
      mid2: Math.round(goldenTimeFinal.mid2 / mLen),
      late: Math.round(goldenTimeFinal.late / mLen),
    };
    const totalKillContrib = killContribFinal.solo + killContribFinal.cleanup;
    const soloKillRate = totalKillContrib > 0 ? Math.round((killContribFinal.solo / totalKillContrib) * 100) : 0;
    const avgIsolationStr = isolationCountFinal > 0 ? (totalIsolationIndexFinal / isolationCountFinal).toFixed(2) : "N/A";
    const avgMinDistStr = isolationCountFinal > 0 ? Math.round(totalMinDist / isolationCountFinal) + "m" : "N/A";

    // [V7.4] ③ 프롬프트 구성
    const promptLines = [
      "당신들은 PUBG 전술 분석 데스크의 전문 코치입니다. 최근 10경기 데이터를 바탕으로 끝장 토론을 진행하십시오.",
      "1. KIND COACH: 획득한 배지를 근거로 유저의 강점을 극대화하고 멘탈을 케어하십시오.",
      "2. SPICY BOMBER: 팀 영향력(Impact)이 낮거나 배지가 적다면 실력 부족을 냉혹하게 찌르십시오.",
      "- 모든 분석 용어는 한글로 표기하고, 대화형(Ping-pong) 구조를 유지하십시오.",
      "- [Apple-to-Apple] 유저 수치와 벤치마크를 명시적으로 비교하십시오. userStats와 benchmarkStats를 반드시 실제 수치로 채우십시오.",
      "- debateIssues는 반드시 3개를 작성하고, 각 issue의 userStats/benchmarkStats는 최소 2개 이상의 실제 수치 문자열을 포함해야 합니다.",
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
- 분석 대상: 최근 10경기 (팀 내 딜량 기여: ${avgDamageImpact}%, 획득 배지: ${topBadges || "없음"})
- 평균 화력: ${avgDamage} (엘리트 Benchmark: ${avgBaselineDamageFinal}), 평균 ${avgKills}킬
- [선제 공격] 주도권 성공률: ${userInitiativeRate}% (Benchmark: ${avgRealInitiativeSuccessFinal}%)
- [교전 압박] 평균 압박 지수: ${avgPressureIndex} (Benchmark: ${avgRealPressureFinal})
- [반응 속도] 대응 사격: ${avgBackupLatency} (Benchmark: ${b_counterLatency}s), 반격 성공률: ${avgCoverRate}%
- [공간 분석] 고립 지수: ${avgIsolationStr} (Benchmark: ${b_isolationIndex}), 아군 평균 거리: ${avgMinDistStr} (Benchmark: ${b_minDist}m), 십자포화 노출: ${totalCrossfireCount}회
- [팀플레이] 아군 기절 ${totalTeammateKnocks}회 → 부활: ${totalRevCount}회 (유저 부활률: ${totalTeammateKnocks>0?Math.round((totalRevCount/totalTeammateKnocks)*100):0}% vs Benchmark: ${b_reviveRate}%)
- [킬 분류] 솔로 킬: ${killContribFinal.solo}회, 클린업 킬: ${killContribFinal.cleanup}회 (솔로 비중: ${soloKillRate}% vs Benchmark: ${b_soloKillRate}%)
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
      teamImpact: { damageImpact: avgDamageImpact, topBadges },
      goldenTime: goldenTimeAvg,
      killContrib: killContribFinal,
      bluezoneWaste: Math.round(totalBluezoneWaste / mLen),
      tactical: { 
        suppRate: totalTeammateKnocks > 0 ? Math.round((totalSuppCount / totalTeammateKnocks) * 100) + "%" : "0%",
        smokeRate: totalTeammateKnocks > 0 ? Math.round((totalSmokeCount / totalTeammateKnocks) * 100) + "%" : "0%",
        reviveRate: totalTeammateKnocks > 0 ? Math.round((totalRevCount / totalTeammateKnocks) * 100) + "%" : "0%",
        baitCount: totalBaitCount,
        isolation: isolationCountFinal > 0 ? {
          isolationIndex: Number((totalIsolationIndexFinal / isolationCountFinal).toFixed(2)),
          minDist: Math.round(totalMinDist / isolationCountFinal),
          heightDiff: Math.round(totalHeightDiff / isolationCountFinal),
          isCrossfire: totalCrossfireCount > 0,
          teammateCount: Math.round(totalTeammateCountFinal / isolationCountFinal) 
        } : null
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

