import { NextResponse } from "next/server";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// [AI-ANALYZE] 총기 코드명 → 한글명 변환 (매치 단일 분석용)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { matchData, nickname, messages, coachingStyle = "spicy" } = body;

    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API 키가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    if (!matchData || !nickname) {
      return NextResponse.json(
        { error: "분석할 데이터가 부족합니다." },
        { status: 400 }
      );
    }

    const { 
      stats, mapName, gameMode = "squad", totalTeamKills, 
      killDetails = [], dbnoDetails = [], team = [], 
      itemUseDetails = [], damageDetails = [], 
      myEarlyBluezoneDamage = 0, myLateBluezoneDamage = 0, 
      teamEarlyBluezoneDamage = 0, teamLateBluezoneDamage = 0,
      matchStartTime = 0,
      eliteBenchmark = { 
        avgDamage: 0, avgKills: 0, 
        realTradeLatency: 0, realInitiativeSuccess: 0, 
        realDeathDistance: 0, realReviveRate: 0, realSmokeRate: 0 
      },
      myRank = { damageRank: 0, damagePercentile: 0, killRank: 0, totalPlayers: 0 },
      combatPressure = { totalHits: 0, uniqueVictims: [], maxHitDistance: 0, utilityDamage: 0, utilityHits: 0 },
      myCombatData = { total: 0, success: 0 },
      deathDistance = 30
    } = matchData;
    const lowerNickname = nickname.toLowerCase();

    // 1. 사용자(Me)와 팀원(Teammates) 데이터 분리
    const myKills = killDetails.filter((k: any) => k.attackerName?.toLowerCase() === lowerNickname);
    const teammateKills = killDetails.filter((k: any) => k.attackerName?.toLowerCase() !== lowerNickname);

    // 심화 분석을 위한 보조 지표 계산
    const killParticipation = totalTeamKills > 0 ? Math.round((stats.kills / totalTeamKills) * 100) : 0;
    const damagePerKill = stats.kills > 0 ? Math.floor(stats.damageDealt / stats.kills) : Math.floor(stats.damageDealt);
    const mobilityStyle = stats.rideDistance > stats.walkDistance ? "차량 중심 장거리 운영" : "도보 중심 신중한 운영";

    // 사용자(Me) 총기별 킬/기절 통계 집계
    const weaponKillMap: Record<string, number> = {};
    for (const k of myKills) {
      if (k.weapon && k.weapon !== "알 수 없음") {
        weaponKillMap[k.weapon] = (weaponKillMap[k.weapon] || 0) + 1;
      }
    }
    const myDbno = dbnoDetails.filter((k: any) => k.attackerName?.toLowerCase() === lowerNickname);
    const weaponDbnoMap: Record<string, number> = {};
    for (const k of myDbno) {
      if (k.weapon && k.weapon !== "알 수 없음") {
        weaponDbnoMap[k.weapon] = (weaponDbnoMap[k.weapon] || 0) + 1;
      }
    }

    // 사용자(Me) 교전 거리 분포
    const distBuckets = { close: 0, mid: 0, long: 0 };
    for (const k of myKills) {
      if (k.distanceM <= 50) distBuckets.close++;
      else if (k.distanceM <= 200) distBuckets.mid++;
      else distBuckets.long++;
    }

    // 사용자(Me) 킬 상세 내역
    const killDetailText =
      myKills.length > 0
        ? myKills
            .slice(0, 5)
            .map(
              (k: any, i: number) =>
                `  ${i + 1}. [${k.weapon}] ${k.distanceM}m / ${k.isHeadshot ? "헤드샷 ✓" : "일반"} → 희생자: ${k.victimName}`
            )
            .join("\n")
        : "  내 킬 데이터 없음";

    // 사용자(Me) 사망 내역 추출 (나를 죽인 범인 찾기)
    const myDeath = killDetails.find((k: any) => k.victimName?.toLowerCase() === lowerNickname);
    const deathDetailText = myDeath 
      ? `[마지막 교전 정보] ${myDeath.attackerName}에게 ${myDeath.distanceM}m 거리에서 ${myDeath.weapon}(으)로 사망 (${myDeath.isHeadshot ? "헤드샷" : "일반"})`
      : stats.deathType === "alive" ? "생존 우승!" : `사망 원인: ${stats.deathType}`;

    // 2. 팀원 성과 요약 생성 (부하 최소화를 위해 핵심 요약만)
    const teammateSummaryText = team
      .filter((m: any) => m.name.toLowerCase() !== lowerNickname)
      .map((m: any) => {
        const killsByTeammate = teammateKills.filter((k: any) => k.attackerName === m.name);
        const mainWeapon = killsByTeammate.length > 0 ? killsByTeammate[0].weapon : "정보없음";
        return `- ${m.name}: ${m.kills}킬 / ${m.assists}어시 / 딜량 ${Math.floor(m.damageDealt)} / 주무기: ${mainWeapon}`;
      })
      .join("\n");
    
    // 3. 유틸리티(투척물) 사용 요약
    const smokeCount = itemUseDetails.filter((i: any) => (i.itemId || "").toLowerCase().includes("smokebomb")).length;
    const grenadeCount = itemUseDetails.filter((i: any) => (i.itemId || "").toLowerCase().includes("grenade")).length;
    const molotovCount = itemUseDetails.filter((i: any) => (i.itemId || "").toLowerCase().includes("molotov")).length;
    
    // 4. 교전 타임라인 재구성 (최근 10개 이벤트만 - 연관성 중심)
    const timelineEvents = [
      ...killDetails.map((k: any) => ({ ...k, type: "킬/사망" })),
      ...dbnoDetails.map((d: any) => ({ ...d, type: "기절" })),
      ...itemUseDetails.map((i: any) => ({ ...i, type: "아이템사용" }))
    ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
     .slice(-10); // 마지막 교전 집중 분석을 위해 최근 10개만

    const formatElapsedTime = (eventTime: string) => {
      if (!matchStartTime) return "시간정보 없음";
      const elapsedSec = Math.floor((new Date(eventTime).getTime() - matchStartTime) / 1000);
      const m = Math.floor(elapsedSec / 60);
      const s = elapsedSec % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const timelineText = timelineEvents.map(e => {
        const timeStr = formatElapsedTime(e.time);
        if (e.type === "킬/사망") return `  [${timeStr}] ${e.attackerName} -> ${e.victimName} (${e.weapon})`;
        if (e.type === "기절") return `  [${timeStr}] ${e.attackerName} -> ${e.victimName} 기절 (${e.weapon})`;
        return `  [${timeStr}] ${e.playerName} -> ${e.itemName} 사용`;
    }).join("\n");

    // 5. 아군 백업(Backup/Crossfire) 분석 로직
    // 사용자(Me)가 데미지를 입는 시각과 아군이 동일한 적에게 데미지를 가하는 시각 대조
    const myDeathTime = myDeath ? new Date(myDeath.time).getTime() : 0;
    const teamSupportCount = damageDetails.filter((d: any) => {
        if (!myDeath) return false;
        const eventTime = new Date(d.time).getTime();
        // 내가 죽기 전 10초 이내에 아군이 적(나를 죽인 범인)에게 데미지를 입혔는지 확인
        return d.attackerName !== nickname && 
               d.victimName === myDeath.attackerName && 
               Math.abs(myDeathTime - eventTime) < 10000;
    }).length;
    const backupStatus = teamSupportCount > 0 ? `지원 사격 확인 (${teamSupportCount}회 hit)` : "아군 백업 화력 부재 (각개격파 위험)";

    // 6. SR/DMR 저격 교전 분석 수치 산출
    const srDmrWeapons = ["Kar98k", "M24", "AWM", "Mosin Nagant", "Dragunov", "Mini14", "SLR", "SKS", "Mk12", "QBU", "Mk14", "VSS"];
    // 내가 적을 저격으로 눕힌 횟수 (팀 킬 기록 + 기절 기록 활용)
    const snipedEnemiesCount = [...teammateKills, ...dbnoDetails].filter(k => k.attackerName === nickname && srDmrWeapons.includes(k.weapon)).length;
    // 내가 적의 저격에 눕거나 죽은 횟수
    const knockedBySniperCount = [...killDetails, ...dbnoDetails].filter(k => k.victimName === nickname && srDmrWeapons.includes(k.weapon)).length;
    const sniperDuelReport = `저격 성공 ${snipedEnemiesCount}회 / 피격 패배 ${knockedBySniperCount}회`;

    // 7. 교전 효율(Trade Efficiency) 및 피킹 능력 산출
    const totalDamageTaken = damageDetails
      .filter((d: any) => d.victimName?.toLowerCase() === lowerNickname)
      .reduce((sum: number, d: any) => sum + (d.damage || 0), 0);
    const tradeEfficiency = totalDamageTaken > 0 ? (stats.damageDealt / totalDamageTaken).toFixed(2) : stats.damageDealt.toFixed(2);

    const playerReportSummary = `
현재 매치 요약:
- 플레이어: ${nickname} (맵: ${mapName}, 모드: ${gameMode}, 순위: #${stats.winPlace})
- 내 전투: ${stats.kills}킬 / ${stats.assists}어시 / ${stats.DBNOs}회 기절시킴 / 딜량 ${Math.floor(stats.damageDealt)}
- 저격전 성적: ${sniperDuelReport} (SR/DMR 교전)
- 내 효율: 킬당 평균 ${damagePerKill}딜 / 팀 킬 기여도 ${killParticipation}%
- 내 스타일: ${mobilityStyle} / 생존 ${Math.floor(stats.timeSurvived / 60)}분 ${stats.timeSurvived % 60}초
- 사망 유형: ${stats.deathType || "정보 없음"}
- 마지막 교전: ${deathDetailText}
- 교전 시 팀원 거리: ${myDeath?.teammateDistances ? Object.entries(myDeath.teammateDistances).map(([name, dist]) => `${name}(${dist}m)`).join(", ") : "정보 없음"}
- 내 자기장 피해: 초반 ${Math.floor(myEarlyBluezoneDamage)} HP / 3단계 이후 ${Math.floor(myLateBluezoneDamage)} HP (1:1 코칭용)
- 팀 전체 자기장 피해: 초반 ${Math.floor(teamEarlyBluezoneDamage)} HP / 3단계 이후 ${Math.floor(teamLateBluezoneDamage)} HP (운영 판단용)
- 교전 효율(Trade): ${tradeEfficiency} (낸 데미지 / 받은 데미지. 1.0 이상이면 피킹/교전 우위)
- 아군 백업: ${backupStatus}

[V3.0 전술 분석 지표]
- 상대적 우위: 매치 딜량 상위 ${100 - (myRank?.damagePercentile || 0)}% (정규 참가자 ${myRank?.totalPlayers || 0}명 중 딜량 ${myRank?.damageRank || 0}위 / 킬 ${myRank?.killRank || 0}위)
- 글로벌 엘리트 대비: 내 딜량(${Math.floor(stats.damageDealt)}) vs 랭커 평균(${eliteBenchmark?.avgDamage || 0})
- 전술 반응 속도 비교: 내 백업(${matchData.tradeStats?.backupLatencyMs > 0 ? (matchData.tradeStats.backupLatencyMs/1000).toFixed(2) + 's' : 'N/A'}) vs 랭커 평균(${(eliteBenchmark?.realTradeLatency/1000).toFixed(2)}s)
- 주도권 성공률 비교: 내 성공률(${myCombatData.total > 0 ? Math.round((myCombatData.success / myCombatData.total) * 100) : 0}%) vs 랭커 평균(${eliteBenchmark?.realInitiativeSuccess}%)
- 팀원 거리 유지: 내 평균(${deathDistance || 30}m) vs 랭커 평균(${eliteBenchmark?.realDeathDistance}m)
- 교전 압박(Pressure): 총 ${combatPressure?.totalHits || 0}회 적중 / ${combatPressure?.uniqueVictims?.length || 0}명의 적을 동시에 압박
- 전술 기여 (성공/기회): 견제사격(${matchData.tradeStats?.suppCount || 0}/${matchData.tradeStats?.dangerousKnocks || 0}), 연막세이브(${matchData.tradeStats?.smokeCount || 0}/${matchData.tradeStats?.smokeOpps || 0} [Elite: ${eliteBenchmark?.realSmokeRate}%]), 직접부활(${matchData.tradeStats?.revCount || 0}/${matchData.tradeStats?.teammateKnocks || 0} [Elite: ${eliteBenchmark?.realReviveRate}%]), 복수/미끼(${matchData.tradeStats?.baitCount || 0}회)
- 대응 속도: 평균 백업 ${matchData.tradeStats?.backupLatencyMs > 0 ? (matchData.tradeStats.backupLatencyMs/1000).toFixed(2) : "N/A"}초 (커버율 ${matchData.tradeStats?.coverRate || 0}%)
- 피킹 정밀도: 최대 적중 거리 ${combatPressure?.maxHitDistance || 0}m
- 투척물 효율: ${combatPressure?.utilityHits || 0}회 적중 / 누적 데미지 ${combatPressure?.utilityDamage || 0}

[내 무기 분석]
- 총기별 킬: ${JSON.stringify(weaponKillMap)}
- 교전 거리: 근접 ${distBuckets.close} / 중거리 ${distBuckets.mid} / 장거리 ${distBuckets.long}
- 킬 상세:
${killDetailText}

[우리 팀원 활약상]
${teammateSummaryText || "- 팀원 정보 없음 (솔로 매치)"}

[전술 장비 및 타임라인]
- 팀 전체 유틸리티: 연막탄 ${smokeCount}회 / 수류탄 ${grenadeCount}회 / 화염병 ${molotovCount}회
- 주요 타임라인(최근 10건):
${timelineText || "  상세 타임라인 정보 없음"}
    `.trim();

    const mildPrompt = `
너는 유저의 성장을 진심으로 응원하는 '다정한 실력파 코치'야. 
[상대적 우위]와 [교전 압박] 지표를 핵심으로 분석해줘.
킬이 낮더라도 [교전 압박(Hits)]이 높다면 "팀의 승리를 위해 묵묵히 화력을 지원하고 적을 묶어둔 훌륭한 서포터였다"는 점을 꼭 칭찬해줘.
최대 적중 거리가 높다면 "정밀한 사격 능력을 갖추고 있다"며 사용자에게 자신감을 북돋아줘.
"고생하셨어요! 이 부분은 정말 센스 있었네요" 처럼 따뜻하면서도 전문적인 톤을 유지해.
기회(Opportunity)가 0인 항목에 대해서는 아예 언급하지 않는 것이 자연스러워.

[분석 데이터 요약]
${playerReportSummary}
`.trim();

    const spicyPrompt = `
당신은 아주 냉정하고 날카로운 실전형 '독설 교관'입니다.
제공된 데이터를 통해 플레이어의 한심한 실책과 전술적 무능을 낱낱이 파헤쳐 팩폭을 가하십시오.
- 핵심 기조: "실력 없는 친절함은 배그에서 죽음뿐이다."
- 지표 해석 가이드 (절대 준수): 
  1. 킬당 데미지(Damage per Kill)가 80~160 사이라면 "가장 이상적이고 결정력 있는 사격"을 한 것입니다. 이 수치를 두고 '비겁하다', '양념만 쳤다', '숟가락 얹었다'는 식으로 비난하는 것은 금지하며, 오히려 "효율적인 자원 관리와 결정력"으로 평가하십시오. 킬당 데미지가 250 이상일 때만 "확킬을 못 찍는 결단력 부족"으로 질책하십시오.
  2. 킬/딜 기여도(Participation)가 40%를 넘는다면 당신의 독설 대상에서 "버스 승객"이나 "방관자"라는 표현은 삭제하십시오. 그는 팀의 주축(Main Force)입니다.
  3. 기회(Opportunity)가 0인 항목에 대해서는 절대로 비난하거나 언급하지 마십시오. (예: 아군 기절이 없었으면 '연막 세이브'나 '부활' 지표가 0이어도 정상임)

[분석 데이터 요약]
${playerReportSummary}
`.trim();

    const systemPrompt = coachingStyle === "mild" ? mildPrompt : spicyPrompt;

    // 대화 내역(messages) 포맷팅: Gemini는 단일 텍스트 프롬프트로 처리하여 문맥 유지
    const history = messages || [];
    let promptText = "";
    if (history.length > 0) {
      const chatHistory = history.map((m: any) => `${m.role === "user" ? "사용자 질문" : "AI 코치 답변"}: ${m.content}`).join("\n\n");
      const isCloseToWin = stats.winPlace >= 2 && stats.winPlace <= 5;
      const rankContext = isCloseToWin 
        ? `\n\n[준우승 지점 분석 요청] 사용자가 #${stats.winPlace}위로 아쉽게 우승을 놓쳤습니다. [마지막 교전 정보]를 바탕으로 1등과의 마지막 싸움에서 무엇이 부족했는지(거리, 무기 상성, 정밀도 등)를 날카롭게 분석해 주세요.` 
        : "";

      promptText = `${systemPrompt}\n\n[이전 대화 내역]\n${chatHistory}\n\n[추가 지시사항]${rankContext}\n위 대화 내역의 마지막 사용자 질문에 대해 한국어로 명확하게 답변해 주세요.`;
    } else {
      const isCloseToWin = stats.winPlace >= 2 && stats.winPlace <= 5;
      const rankContext = isCloseToWin 
        ? `\n특히 이번 경기 #${stats.winPlace}위로 준우승했습니다. [마지막 교전 정보]를 토대로 1등을 놓친 결정적 이유를 포함시켜 주세요.`
        : "";

      promptText = `${systemPrompt}\n\n이 매치 데이터를 바탕으로 유저가 한눈에 읽을 수 있도록 **정확히 3~5줄 내외**로 '알찬 요약 피드백'을 작성해줘. 
      [전반적인 총평], [핵심 실책 또는 칭찬], [개선할 점]을 문장 속에 자연스럽게 녹여내되, 별도의 소제목은 붙이지 마세요.${rankContext}`;
    }

    let analysis = "";

    // 2026년 4월 기준 최적화된 모델 폴백 리스트 (Preview 명칭 반영)
    const modelsToTry = [
      "gemini-3.1-flash-lite-preview", // 1순위: RPD 500회 (공식 프리뷰 명칭)
      "gemini-3-flash-preview",        // 2순위: 고성능 프리뷰
      "gemini-2.5-flash-lite",         // 3순위: 안정 버전 (Lite)
      "gemma-3-27b"                    // 4순위: 텍스트 전용 무제한 가깝게 지원
    ];

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // [V3.0] 세이프티 설정 추가 (독설 코칭 스타일 허용)
    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ];

    for (const modelName of modelsToTry) {
      try {
        console.log(`[AI-ANALYZE] Attempting analysis with ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName, safetySettings });
        const result = await model.generateContent(promptText);
        analysis = result.response.text();
        
        if (analysis) break; // 분석 성공 시 루프 탈출
      } catch (err: any) {
        const errorMsg = err.message || "";
        console.warn(`[AI-ANALYZE] ${modelName} failed: ${errorMsg}`);
        
        // 과부하(503), 할당량(429), 또는 모델 없음(404) 시 다음 모델로 전환
        if (errorMsg.includes("503") || errorMsg.includes("Service Unavailable") || 
            errorMsg.includes("429") || errorMsg.includes("quota") ||
            errorMsg.includes("404") || errorMsg.includes("not found")) {
          console.warn(`[AI-ANALYZE] Switching to next model...`);
          continue;
        }
        // 그 외 치명적 에러는 중단
        throw err;
      }
    }

    if (!analysis) {
      throw new Error("분석 리포트를 생성할 수 없습니다.");
    }

    return NextResponse.json({ analysis });
  } catch (error: any) {
    console.error("AI 분석 서비스 에러:", error);
    return NextResponse.json(
      { error: error.message || "서버 내부 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
