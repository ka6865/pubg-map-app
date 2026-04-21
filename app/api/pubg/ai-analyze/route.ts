import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// [AI-ANALYZE] 총기 코드명 → 한글명 변환 (매치 단일 분석용)
const WEAPON_MAP: Record<string, string> = {
  WeapAKM_C: "AKM", WeapBerylM762_C: "베릴 M762", WeapM416_C: "M416", "WeapSCAR-L_C": "SCAR-L",
  WeapAUG_C: "AUG", WeapG36C_C: "G36C", WeapQBZ95_C: "QBZ", WeapK2_C: "K2", WeapAce32_C: "ACE32",
  WeapM16A4_C: "M16A4", WeapMk47Mutant_C: "뮤턴트", WeapSKS_C: "SKS", WeapSLR_C: "SLR",
  WeapMk14_C: "Mk14", WeapMini14_C: "미니14", WeapQBU88_C: "QBU", WeapVSS_C: "VSS",
  WeapDragunov_C: "드라구노프", WeapKar98k_C: "Kar98k", WeapM24_C: "M24", WeapAWM_C: "AWM",
  WeapMosinNagant_C: "모신나강", WeapWin1894_C: "윈체스터", WeapLynxAMR_C: "링스 AMR",
  WeapUZI_C: "마이크로 UZI", WeapUMP45_C: "UMP45", WeapVector_C: "벡터", WeapTommyGun_C: "토미건",
  WeapBizonPP19_C: "비존", WeapMP5K_C: "MP5K", WeapP90_C: "P90", WeapJS9_C: "JS9",
  WeapS12K_C: "S12K", WeapS1897_C: "S1897", WeapS686_C: "S686", WeapDBS_C: "DBS",
  WeapM249_C: "M249", WeapDP28_C: "DP-28", WeapMG3_C: "MG3", WeapCrossbow_C: "석궁",
  WeapPanzerfaust100_C: "판저파우스트", WeapM79_C: "M79", WeapGrenade_C: "수류탄",
  WeapMolotov_C: "화염병", Item_Weapon_FlashBang_C: "섬광탄", Item_Weapon_C4_C: "C4",
};

const getWeaponName = (id: string): string => {
  if (!id || id === "None" || id === "null") return "알 수 없음";
  if (WEAPON_MAP[id]) return WEAPON_MAP[id];
  if (id.startsWith("Damage_")) {
    const map: Record<string, string> = {
      Damage_BlueZone: "자기장", Damage_RedZone: "폭격", Damage_Fall: "낙하",
      Damage_Drowning: "익사", Damage_OutsidePlayZone: "자기장",
    };
    return map[id] || id.replace("Damage_", "");
  }
  return id.replace(/^Weap/, "").replace(/_C$/, "").replace(/_/g, " ");
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { matchData, nickname, messages } = body;

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

    const { stats, mapName, gameMode, totalTeamKills, killDetails = [], dbnoDetails = [], team = [], itemUseDetails = [], vehicleDetails = [], damageDetails = [], earlyBluezoneDamage = 0, lateBluezoneDamage = 0 } = matchData;
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
    const smokeCount = itemUseDetails.filter((i: any) => i.itemId === "Item_Weapon_SmokeBomb_C").length;
    const grenadeCount = itemUseDetails.filter((i: any) => i.itemId === "Item_Weapon_Grenade_C").length;
    const molotovCount = itemUseDetails.filter((i: any) => i.itemId === "Item_Weapon_Molotov_C").length;
    
    // 4. 교전 타임라인 재구성 (최근 10개 이벤트만 - 연관성 중심)
    const timelineEvents = [
      ...killDetails.map((k: any) => ({ ...k, type: "킬/사망" })),
      ...dbnoDetails.map((d: any) => ({ ...d, type: "기절" })),
      ...itemUseDetails.map((i: any) => ({ ...i, type: "아이템사용" }))
    ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
     .slice(-10); // 마지막 교전 집중 분석을 위해 최근 10개만

    const timelineText = timelineEvents.map(e => {
        const timeStr = new Date(e.time).toLocaleTimeString("ko-KR", { minute: "2-digit", second: "2-digit" });
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
- 자기장 피해: 초반 ${Math.floor(earlyBluezoneDamage)} HP / 3단계 이후 ${Math.floor(lateBluezoneDamage)} HP (후반 피해가 클수록 운영 실패)
- 아군 백업: ${backupStatus}

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

    const systemPrompt = `
너는 배틀그라운드 유저의 성장을 돕는 '날카로운 1:1 전술 멘토'야.
흔한 칭찬보다는 플레이어의 데이터를 기반으로 실질적인 실력을 향상시킬 수 있는 '현실적이고 뼈아픈 조언'을 제공하는 것이 네 역할이야.

[최우선 절대 규칙 (Output Constraints)]
1. 언어: 반드시 100% 자연스러운 한국어(한글)로만 답변하세요.
2. 🛑 ⚠️ 경고: '优秀', 'mechanism' 등의 외국어(중국어/영어)를 절대 섞지 마세요.
3. 톤앤매너: 칭찬은 30%, 문제점 및 보완사항 지적은 70% 비중으로 구성하세요. "프로처럼 하라"는 식의 입기만 좋은 말은 생략하고, "교전 승률을 높이기 위해 ~가 반드시 필요하다"는 식의 실용적인 화법을 채택하세요.
4. 데이터 기반 질책: 제공된 텔레메트리 수치(거리, 피해량, 자기장 피해, 아군 거리 등)를 근거로 논리적으로 반박할 수 없는 날카로운 피드백을 제공하세요.
5. 팀워크 분석: 제공된 [우리 팀원 활약상] 데이터를 바탕으로 닉네임을 언급하며 구체적으로 피드백하세요.

[전문 분석 및 코칭 가이드라인]
1. 상황 맥락 파악(Context-Aware): 초반 난전에서 살아남은 것은 인정하되, 그 과정에서 소모된 자원이나 위치 선점의 미흡함을 짚어주세요.
2. 무기군 역할 분담: SMG/산탄총 사용 시 "초반에 잘 버텼다" 정도로 짧게 언급하고, 후반 운영을 위한 주력 AR/DMR 확보 및 교체 실기 여부를 강하게 지적하세요.
3. 마스터피스 전술 분석: 
    - 거리 가이드라인:
        * 0~50m: 밀집 대형 (즉시 지원 가능하나 동시 타격 위험)
        * 50~100m: 표준 전술 거리 (최적의 화력 지원 각)
        * 150m 이상: 고립 위험 (백업 지연으로 인한 각개격파 1순위)
    - 양각 vs 고립 판별: 아군과의 거리가 150m 이상이고 백업이 전무하다면 "무리한 우회로 인한 고립"으로 지적하고 구체적인 거리 조정을 제안하세요.
    - 저격전 코칭: 
        * SR/DMR로 적의 저격에 기절한 횟수(피격 패배)가 많다면 "피킹(Peeking) 각 노출이 너무 길거나 움직임이 단조롭다"고 질책하세요.
    - 자기장 운영: 3페이즈(단계) 이후 자기장 피해(lateBluezoneDamage)가 30HP 이상이라면 "교전 실력 이전에 판단 지연에 따른 운영 실패"임을 강하게 지적하세요.
    - 유틸리티 활용: 연막탄이나 투척물이 인벤토리에 있음에도 쓰지 않고 죽었다면 "죽기 전에 투척물 1개는 반드시 소모하라"는 식의 실전 지침을 주세요.
4. 배그 전문 용어: 파밍, 자기장, 존버, 양각, 인서클 등 한국 게이머의 용어를 자연스럽게 활용하세요.

[데이터 배경]
${playerReportSummary}
    `.trim();

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

      promptText = `${systemPrompt}\n\n이 매치 데이터를 바탕으로 심층 분석 리포트를 [전반적인 매치 성격], [무기 및 교전 분석], [운영 디테일 진단], [프로 코치의 조언] 형식에 맞춰 작성해줘.${rankContext}`;
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

    for (const modelName of modelsToTry) {
      try {
        console.log(`[AI-ANALYZE] Attempting analysis with ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName });
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
