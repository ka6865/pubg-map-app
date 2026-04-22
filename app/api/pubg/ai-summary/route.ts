import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "../../../../lib/supabase";

export async function POST(request: Request) {
  console.log("[AI-SUMMARY] 초정밀 분석 요청 시작 (Telemetry Mode)");
  try {
    const { matchIds, nickname, platform, coachingStyle = "spicy" } = await request.json();

    const normalizeName = (n: string) => n?.toLowerCase().trim() || "";
    const lowerNickname = normalizeName(nickname);

    if (!matchIds || matchIds.length === 0) {
      return NextResponse.json({ error: "매치 데이터가 없습니다." }, { status: 400 });
    }

    // 1. 매치 상세 데이터 및 캐시 확인 (최대 10판)
    const targetMatchIds = matchIds.slice(0, 10);
    const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;

    if (!geminiApiKey) {
      return NextResponse.json({ error: "Gemini API 키가 설정되지 않았습니다." }, { status: 500 });
    }

    // [STEP 1] DB에서 이미 분석된 매치 확인
    const { data: cachedMatches } = await supabase
      .from("processed_match_telemetry")
      .select("match_id, data")
      .in("match_id", targetMatchIds)
      .eq("player_id", lowerNickname);

    const cachedMap = new Map<string, any>();
    if (cachedMatches) {
      console.log(`[AI-SUMMARY] DB 캐시 조회 결과: ${cachedMatches.length}건 발견`);
      cachedMatches.forEach(m => {
        const fullResult = (m.data as any)?.fullResult;
        // [V13] 버전 태그(v: 13)를 통해 딜량 상위 10명 기준치가 포함된 데이터인지 확인
        if (fullResult && fullResult.v >= 13) {
          cachedMap.set(m.match_id, fullResult);
        } else {
          console.warn(`[AI-SUMMARY] 매치 ${m.match_id}의 데이터가 구버전(v < 13)입니다. 정밀 재분석을 강제합니다.`);
        }
      });
    }

    // 미분석 매치 아이디 추출
    const missingMatchIds = targetMatchIds.filter((id: string) => !cachedMap.has(id));
    console.log(`[AI-SUMMARY] 총 ${targetMatchIds.length}경기 중 캐시 ${cachedMap.size}건, 신규 분석 ${missingMatchIds.length}건`);

    // [STEP 2] 신규 분석이 필요한 매치 처리 (순차 처리로 서버 부하 및 중복 작업 방지)
    const newResultsMap = new Map<string, any>();
    if (missingMatchIds.length > 0) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      
      for (const id of missingMatchIds) {
        try {
          console.log(`[AI-SUMMARY] Processing missing match: ${id}`);
          const res = await fetch(`${baseUrl}/api/pubg/match?matchId=${id}&nickname=${nickname}&platform=${platform}`);
          if (res.ok) {
            const data = await res.json();
            if (data && !data.isEventMode) {
              newResultsMap.set(id, data);
            }
          }
        } catch (e) {
          console.error(`[AI-SUMMARY] 신규 매치 ${id} 분석 실패:`, e);
        }
      }
    }

    // [STEP 3] 최종 순서 조립 (사용자 요청 순서대로)
    const detailedMatches = targetMatchIds
      .map((id: string) => cachedMap.get(id) || newResultsMap.get(id))
      .filter(Boolean);

    if (detailedMatches.length === 0) {
      return NextResponse.json({ error: "상세 매치 정보를 가져올 수 없습니다." }, { status: 404 });
    }

    // 2. 데이터 집계 및 요약 (AI 프롬프트 토큰 절약을 위해 전처리)
    const totalKills = detailedMatches.reduce((acc: number, m: any) => acc + (m.stats?.kills || 0), 0);
    const totalDamage = detailedMatches.reduce((acc: number, m: any) => acc + (m.stats?.damageDealt || 0), 0);
    const totalHeadshotKills = detailedMatches.reduce((acc: number, m: any) => acc + (m.stats?.headshotKills || 0), 0);
    const avgDamage = Math.floor(totalDamage / detailedMatches.length);
    const avgWinPlace = detailedMatches.reduce((acc: number, m: any) => acc + (m.stats?.winPlace || 0), 0) / detailedMatches.length;

    // 총기별 집계
    const weaponKillCount: Record<string, number> = {};
    const weaponDbnoCount: Record<string, number> = {};
    const distBuckets = { close: 0, mid: 0, long: 0 };

    detailedMatches.forEach((m: any) => {
      (m.killDetails || []).forEach((k: any) => {
        if (k.weapon && k.weapon !== "알 수 없음") {
          weaponKillCount[k.weapon] = (weaponKillCount[k.weapon] || 0) + 1;
        }
        if (k.distanceM <= 50) distBuckets.close++;
        else if (k.distanceM <= 200) distBuckets.mid++;
        else distBuckets.long++;
      });
      (m.dbnoDetails || []).forEach((k: any) => {
        if (k.weapon && k.weapon !== "알 수 없음") {
          weaponDbnoCount[k.weapon] = (weaponDbnoCount[k.weapon] || 0) + 1;
        }
      });
    });

    // 공식 스탯 기반 헤드샷 비율 계산
    const headshotRate = totalKills > 0 ? `${Math.round((totalHeadshotKills / totalKills) * 100)}%` : "0%";

    // 전술 패턴 집계
    let totalLateBluezoneDamage = 0;
    let totalOverallDamageTaken = 0;
    let isolatedDeathCount = 0;
    let totalDeathDistanceSum = 0;
    let deathDistanceCount = 0;
    const srDmrWeapons = ["Kar98k", "M24", "AWM", "Mosin Nagant", "Dragunov", "Mini14", "SLR", "SKS", "Mk12", "QBU", "Mk14", "VSS"];
    let totalSnipedEnemies = 0;
    let totalKnockedBySniper = 0;
    
    let totalV3Hits = 0;
    let totalV3UniqueVictims = 0;
    let maxV3Distance = 0;
    let totalV3UtilityHits = 0;
    let totalV3UtilityDamage = 0;
    let totalDamagePercentileSum = 0;
    let bestKillRank = 999;
    
    // 유틸리티 및 팀워크 지표
    let totalHealsUsed = 0;
    let totalBoostsUsed = 0;
    let totalRevivesPerformed = 0;
    let totalSmokesUsed = 0;
    let totalFragsUsed = 0;
    
    let totalMyDbnos = 0;
    let totalMyDbnosFinished = 0;
    let totalTeamRevives = 0;
    let totalTeamDbnosTaken = 0;

    // [V12] 우승권(Top 10) 평균 지표 누적용
    let totalBaselineDamage = 0;
    let totalBaselineKills = 0;
    let totalBaselineHeadshotRate = 0;
    let validBaselineMatches = 0;

    detailedMatches.forEach((m: any) => {
      // 내 기절/마무리율 계산 (내가 기절시킨 적이 내 킬로그에 있는지 확인)
      const myDbnos = (m.dbnoDetails || []).filter((d: any) => normalizeName(d.attackerName) === lowerNickname);
      totalMyDbnos += myDbnos.length;
      const myKills = (m.killDetails || []).filter((k: any) => normalizeName(k.attackerName) === lowerNickname);
      
      // 내 킬 중, 그 이전에 내가 직접 기절(DBNO)시킨 적이 있는지 확인하여 확킬 횟수를 계산
      myKills.forEach((kill: any) => {
        const killTime = new Date(kill.time).getTime();
        const relatedDbno = myDbnos.find((dbno: any) => {
          const dbnoTime = new Date(dbno.time).getTime();
          return normalizeName(dbno.victimName) === normalizeName(kill.victimName) && dbnoTime <= killTime;
        });
        
        if (relatedDbno) {
          totalMyDbnosFinished++;
        }
      });
      totalLateBluezoneDamage += (m.lateBluezoneDamage || 0);
      totalOverallDamageTaken += (m.damageTaken || 0);
      totalV3Hits += (m.combatPressure?.totalHits || 0);
      totalV3UniqueVictims += (m.combatPressure?.uniqueVictims?.length || 0);
      if ((m.combatPressure?.maxHitDistance || 0) > maxV3Distance) maxV3Distance = m.combatPressure.maxHitDistance;
      totalV3UtilityHits += (m.combatPressure?.utilityHits || 0);
      totalV3UtilityDamage += (m.combatPressure?.utilityDamage || 0);
      totalDamagePercentileSum += (m.myRank?.damagePercentile || 0);
      
      const currentKillRank = m.myRank?.killRank || 999;
      if (currentKillRank < bestKillRank) bestKillRank = currentKillRank;
      
      // 저격 지표 계산
      const matchKills = (m.killDetails || []).filter((k: any) => srDmrWeapons.some(w => k.weapon?.includes(w))).length;
      const matchDbnos = (m.dbnoDetails || []).filter((k: any) => srDmrWeapons.some(w => k.weapon?.includes(w))).length;
      totalSnipedEnemies += (matchKills + matchDbnos);

      // 내가 저격에 당한 횟수 (victimName이 나인 경우)
      const knockedBySniper = (m.killDetails || []).filter((k: any) => normalizeName(k.victimName) === lowerNickname && srDmrWeapons.some(w => k.weapon?.includes(w))).length;
      totalKnockedBySniper += knockedBySniper;

      if (m.teammateDistancesAtDeath) {
        const distances = Object.values(m.teammateDistancesAtDeath) as number[];
        if (distances.length > 0) {
          const minDist = Math.min(...distances);
          totalDeathDistanceSum += minDist;
          deathDistanceCount++;
          if (minDist >= 150) isolatedDeathCount++;
        }
      }

      // 아이템 및 부활 지표 집계 (내 닉네임 기준 필터링 강화)
      (m.itemUseDetails || []).forEach((i: any) => {
        if (normalizeName(i.playerName) !== lowerNickname) return;
        const id = i.itemId || "";
        if (id.includes("MedKit") || id.includes("FirstAid") || id.includes("Bandage") || id.includes("Heal")) totalHealsUsed++;
        else if (id.includes("PainKiller") || id.includes("EnergyDrink") || id.includes("Adrenaline") || id.includes("Boost")) totalBoostsUsed++;
        else if (id.includes("SmokeBomb")) totalSmokesUsed++;
        else if (id.includes("Grenade")) totalFragsUsed++;
      });

      (m.reviveDetails || []).forEach((r: any) => {
        totalTeamRevives++;
        if (normalizeName(r.reviverName) === lowerNickname) totalRevivesPerformed++;
      });
      totalTeamDbnosTaken += m.teamDbnoVictimCount || 0;

      if (m.top10Baseline) {
        totalBaselineDamage += m.top10Baseline.avgDamage || 0;
        totalBaselineKills += m.top10Baseline.avgKills || 0;
        totalBaselineHeadshotRate += m.top10Baseline.headshotRate || 0;
        validBaselineMatches++;
      }
    });

    const avgDeathDistanceStr = deathDistanceCount > 0 ? `${Math.round(totalDeathDistanceSum / deathDistanceCount)}m` : "측정 불가(생존)";
    const isolatedRate = detailedMatches.length > 0 ? Math.round((isolatedDeathCount / detailedMatches.length) * 100) : 0;
    const overallTradeEfficiency = totalOverallDamageTaken > 0 ? (totalDamage / totalOverallDamageTaken).toFixed(2) : (totalDamage / 1).toFixed(2);
    const avgDamagePercentile = Math.round(totalDamagePercentileSum / detailedMatches.length);
    const finishRateStr = totalMyDbnos > 0 ? `${Math.round((totalMyDbnosFinished / totalMyDbnos) * 100)}%` : "측정 불가(즉사/솔로)";

    // [V12] 기준치 산출
    const avgBaselineDamage = validBaselineMatches > 0 ? Math.round(totalBaselineDamage / validBaselineMatches) : 0;
    const avgBaselineKills = validBaselineMatches > 0 ? Number((totalBaselineKills / validBaselineMatches).toFixed(1)) : 0;
    const avgBaselineHeadshotRate = validBaselineMatches > 0 ? Math.round(totalBaselineHeadshotRate / validBaselineMatches) : 0;

    // 3. AI 프롬프트 구성
    const mildPrompt = `당신은 다정한 실력파 코치입니다. 10경기의 데이터를 바탕으로 독려와 조언을 아끼지 마세요. 말투는 "~해요", "~군요"를 사용하세요.`;
    const spicyPrompt = `당신은 냉혹한 팩트 폭격기입니다. 플레이어의 실책을 날카롭게 비판하세요. 차갑고 시니컬한 말투를 사용하세요. (~죠, ~가요?)`;
    const debatePrompt = `[착한맛 코치]와 [매운맛 폭격기]의 끝장 토론입니다. 

[진행 규칙]
1. 모든 대사는 반드시 지정된 태그와 콜론(:)으로 시작하세요. (예: [착한맛 코치]: , [매운맛 폭격기]: )
2. 착한맛 코치가 플레이어의 장점을 찾아 칭찬으로 토론을 시작하세요.
3. 매운맛 폭격기가 즉시 데이터 기반의 팩트로 반박하며 비판하세요.
4. 서로 2~3회 정도 격렬하게 의견을 교환하세요.
5. 토론이 모두 끝난 후, 반드시 구분선(---)을 긋고 마지막에 별도의 태그인 [최종 합의 결론]: 를 붙여 3가지 지침을 요약하세요. 

[코칭 지침]
- "무기를 하나로 고정하라"는 식의 초보적인 조언은 지양하세요.
- 대신 '교전 시 팀원과의 거리(고립도)', '투척물 및 회복 아이템 활용 타이밍', '자기장 진입 전술', '킬 결정력(기절 대비 확킬 비율)' 등 전문적인 전술 지표를 중심으로 토론하세요.
- 특히 부활 기여도의 경우 주의하세요: 부활 기여가 낮아도 본인의 전투 지표(딜량, 킬, 교전 효율)가 높다면 교전을 전담하여 아군을 커버하느라 부활을 못 한 '합당한 플레이'로 긍정 해석해야 합니다. 반대로 전투 지표도 낮으면서 부활도 하지 않았을 때만 '유령 팀원'으로 강하게 비판하세요.
- **[핵심 지침]**: 제공된 **[상위 10명(High-Performer) 개인 기준치]**와 플레이어의 본인 지표를 직접적으로 비교하세요. "상위 10명의 평균 딜량은 450인데 본인은 299로 부족하다"와 같이, 구체적인 기준치를 들어 비판하거나 칭찬해야 합니다.
- 결론 섹션은 양측이 합의한 객관적이고 단호한 지침 형태여야 합니다.`;

    const systemContext = `배틀그라운드 전술 멘토입니다. 모든 답변은 한국어로 작성하며 선택한 스타일에 엄격히 맞추세요.`;
    
    let finalPrompt = "";
    if (coachingStyle === "mild") finalPrompt = `${systemContext}\n\n${mildPrompt}`;
    else if (coachingStyle === "debate") finalPrompt = `${systemContext}\n\n${debatePrompt}`;
    else finalPrompt = `${systemContext}\n\n${spicyPrompt}`; // spicy가 기본값

    const userPrompt = `
### 📊 [${nickname}] 최근 ${detailedMatches.length}경기 종합 지표
- **전투력**: 평균 딜량 ${avgDamage} (상위 ${100 - avgDamagePercentile}%) / 매치 내 최고 킬 순위 ${bestKillRank}위 / 평균 순위 ${avgWinPlace.toFixed(1)}위
- **정밀도**: 헤드샷 비율 ${headshotRate} / 총 유효타 ${totalV3Hits}회 (교전 대상 수: ${totalV3UniqueVictims}명, 최장 ${maxV3Distance}m)
- **저격 정보**: 저격 성공(킬/기절) ${totalSnipedEnemies}회 / 저격 피격(사망/기절) ${totalKnockedBySniper}회
- **결정력**: 킬 ${totalKills} / 기절 ${totalMyDbnos} (기절시킨 적 마무리율: ${finishRateStr})
- **유지력**: 교전 효율(Trade) ${overallTradeEfficiency} / 회복·부스트 사용 ${totalHealsUsed + totalBoostsUsed}회 / 아군 기절 ${totalTeamDbnosTaken}회 중 본인 부활 기여 ${totalRevivesPerformed}회 (팀 전체 부활: ${totalTeamRevives}회)

### 🧩 전술 및 팀워크 패턴
- **투척물 활용**: 연막탄 ${totalSmokesUsed}회, 수류탄 ${totalFragsUsed}회 (유효타 ${totalV3UtilityHits}회, ${Math.round(totalV3UtilityDamage)}딜)
- **팀 호흡**: 부활 지원 ${totalRevivesPerformed}회 / 평균 팀원 거리(사망 시) ${avgDeathDistanceStr}
- **위험 관리**: 고립 사망률 ${isolatedRate}% / 후반 자기장 피해 ${totalLateBluezoneDamage}
- **교전 거리**: 근접(${distBuckets.close}), 중거리(${distBuckets.mid}), 장거리(${distBuckets.long})

### 🏆 [상위 10명(High-Performer) 개인 기준치 비교표]
- 평균 딜량: 매치 내 딜량 상위 10명 평균 ${avgBaselineDamage} vs 본인 ${avgDamage}
- 평균 킬수: 매치 내 상위 10명 평균 ${avgBaselineKills} vs 본인 ${Number((totalKills / detailedMatches.length).toFixed(1))}
- 헤드샷 비율: 상위 10명 평균 ${avgBaselineHeadshotRate}% vs 본인 ${headshotRate}

### 📋 경기별 데이터 상세
${detailedMatches.map((m: any, i: number) => `[${i+1}판] ${m.mapName} | ${m.stats?.winPlace}위 | ${m.stats?.kills}킬 | ${m.stats?.deathType}`).join('\n')}

위 데이터를 분석하여 [착한맛 코치]와 [매운맛 폭격기]의 시각에서 전문적인 전술 토론을 진행하고, 마지막에 향후 실력 향상을 위한 실전 지침을 제안하세요.`;

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const modelsToTry = ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview"];

    console.log(`[AI-SUMMARY] 최종 프롬프트 준비 완료 (길이: ${finalPrompt.length + userPrompt.length}자)`);
    console.log(`[AI-SUMMARY] 데이터 포함 여부: ${detailedMatches.length}경기 분석 데이터 포함됨`);

    for (const modelName of modelsToTry) {
      try {
        console.log(`[AI-SUMMARY] ${modelName} 모델 시도 중...`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContentStream(`${finalPrompt}\n\n${userPrompt}`);
        
        const stream = new ReadableStream({
          async start(controller) {
            try {
              let chunkCount = 0;
              for await (const chunk of result.stream) {
                const chunkText = chunk.text();
                if (chunkText) {
                  controller.enqueue(new TextEncoder().encode(chunkText));
                  chunkCount++;
                }
              }
              console.log(`[AI-SUMMARY] 스트리밍 완료 (총 ${chunkCount}개 청크 전송)`);
              controller.close();
            } catch (streamErr) {
              console.error(`[AI-SUMMARY] ${modelName} 스트리밍 도중 오류:`, streamErr);
              controller.error(streamErr);
            }
          },
        });

        // Next.js 16에서는 headers를 간소화하는 것이 스트리밍 안정성에 도움이 됩니다.
        return new Response(stream, {
          headers: { 
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache"
          },
        });
      } catch (err) { 
        console.warn(`[AI-SUMMARY] ${modelName} 모델 호출 실패:`, err);
        continue; 
      }
    }
    
    throw new Error("분석 스트림 생성 실패");
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "오류 발생" }, { status: 500 });
  }
}
