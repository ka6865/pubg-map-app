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

    const { stats, mapName, gameMode, totalTeamKills, killDetails = [], dbnoDetails = [] } = matchData;

    // 심화 분석을 위한 보조 지표 계산
    const killParticipation = totalTeamKills > 0 ? Math.round((stats.kills / totalTeamKills) * 100) : 0;
    const damagePerKill = stats.kills > 0 ? Math.floor(stats.damageDealt / stats.kills) : Math.floor(stats.damageDealt);
    const mobilityStyle = stats.rideDistance > stats.walkDistance ? "차량 중심 장거리 운영" : "도보 중심 신중한 운영";

    // 총기별 킬/기절 통계 집계 (텔레메트리 데이터가 있는 경우)
    const weaponKillMap: Record<string, number> = {};
    for (const k of killDetails) {
      if (k.weapon && k.weapon !== "알 수 없음") {
        weaponKillMap[k.weapon] = (weaponKillMap[k.weapon] || 0) + 1;
      }
    }
    const weaponDbnoMap: Record<string, number> = {};
    for (const k of dbnoDetails) {
      if (k.weapon && k.weapon !== "알 수 없음") {
        weaponDbnoMap[k.weapon] = (weaponDbnoMap[k.weapon] || 0) + 1;
      }
    }

    // 교전 거리 분포
    const distBuckets = { close: 0, mid: 0, long: 0 };
    for (const k of killDetails) {
      if (k.distanceM <= 50) distBuckets.close++;
      else if (k.distanceM <= 200) distBuckets.mid++;
      else distBuckets.long++;
    }

    // 킬 상세 내역 텍스트 (최대 10건만 - 토큰 절약)
    const killDetailText =
      killDetails.length > 0
        ? killDetails
            .slice(0, 10)
            .map(
              (k: any, i: number) =>
                `  ${i + 1}. [${k.weapon}] ${k.distanceM}m / ${k.isHeadshot ? "헤드샷 ✓" : "일반"} → 희생자: ${k.victimName}`
            )
            .join("\n")
        : "  텔레메트리 킬 데이터 없음 (0킬 또는 데이터 미수신)";

    const playerReportSummary = `
현재 매치 요약:
- 플레이어: ${nickname} (맵: ${mapName}, 모드: ${gameMode}, 순위: #${stats.winPlace})
- 전투: ${stats.kills}킬 / ${stats.assists}어시 / ${stats.DBNOs}회 기절시킴 / 딜량 ${Math.floor(stats.damageDealt)}
- 효율: 킬당 평균 ${damagePerKill}딜 / 팀 킬 기여도 ${killParticipation}%
- 생존: ${Math.floor(stats.timeSurvived / 60)}분 ${stats.timeSurvived % 60}초 / 스타일: ${mobilityStyle}
- 아이템: 회복 ${stats.heals}회 / 부스트 ${stats.boosts}회
- 헤드샷 킬: ${stats.headshotKills}회 / 최장 킬: ${stats.longestKill || 0}m
- 사망 유형: ${stats.deathType || "정보 없음"}

[텔레메트리 기반 무기 분석]
- 총기별 킬 횟수: ${Object.keys(weaponKillMap).length > 0 ? JSON.stringify(weaponKillMap) : "없음"}
- 총기별 기절 횟수: ${Object.keys(weaponDbnoMap).length > 0 ? JSON.stringify(weaponDbnoMap) : "없음"}
- 교전 거리: 근접 ${distBuckets.close}킬 / 중거리 ${distBuckets.mid}킬 / 장거리 ${distBuckets.long}킬
- 킬 상세:
${killDetailText}
    `.trim();

    const systemPrompt = `
너는 배틀그라운드 프로팀의 '수석 데이터 분석가'이자 유저의 성장을 돕는 코치야.
사용자가 제공하는 매치 데이터와 텔레메트리 킬 로그를 바탕으로 심도 있는 분석과 답변을 제공해줘.

[최우선 절대 규칙 (Output Constraints)]
1. 언어: 반드시 100% 자연스러운 한국어(한글)로만 답변해.
   - 🛑 ⚠️ 경고: '优秀', '稳定的' 같은 한자(중국어)나 'mechanism', 'bluezone' 등 불필요한 영단어를 단 한 글자도 섞지 마. 어색한 번역체 대신 "우수합니다", "안정적인" 같은 한국어로 표현해.
2. 허용 영문: 'M416', 'AKM', 'KDA', 'AR', 'SR' 등 배틀그라운드 공식 총기명 및 게임 용어는 영문 그대로 허용해.
3. 배그 전문 용어: 파밍, 자기장, 존버, 찌르기, 양각 등 한국 게이머들이 일상적으로 쓰는 용어를 자연스럽게 활용해.
4. 분석 요건: 텔레메트리 킬 데이터가 존재할 경우, 두루뭉술하게 말하지 말고 "어떤 무기로 몇 m 거리에서 어떤 부위(헤드샷/일반)를 맞췄는지" 정확한 수치와 팩트를 기반으로 피드백해.
5. 유저 맞춤형 해석: 사용자의 질문 의도를 파악하고, 제공된 데이터를 근거로 유기적인 해설을 제공해.

[데이터 배경]
${playerReportSummary}
    `.trim();

    // 대화 내역(messages) 포맷팅: Gemini는 단일 텍스트 프롬프트로 처리하여 문맥 유지
    const history = messages || [];
    let promptText = "";
    if (history.length > 0) {
      const chatHistory = history.map((m: any) => `${m.role === "user" ? "사용자 질문" : "AI 코치 답변"}: ${m.content}`).join("\n\n");
      promptText = `${systemPrompt}\n\n[이전 대화 내역]\n${chatHistory}\n\n[추가 지시사항]\n위 대화 내역의 마지막 사용자 질문에 대해 한국어로 명확하게 답변해 주세요.`;
    } else {
      promptText = `${systemPrompt}\n\n이 매치 데이터를 바탕으로 심층 분석 리포트를 [전반적인 매치 성격], [무기 및 교전 분석], [운영 디테일 진단], [프로 코치의 조언] 형식에 맞춰 작성해줘.`;
    }

    let analysis = "";

    // 2026년 기준 안정적인 모델 폴백 리스트
    const modelsToTry = [
      "gemini-flash-latest",
      "gemini-2.5-flash",
      "gemini-3.1-flash-lite-preview",
      "gemini-pro-latest"
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
        
        // 과부하(503) 또는 할당량(429) 시 다음 모델로 전환
        if (errorMsg.includes("503") || errorMsg.includes("Service Unavailable") || 
            errorMsg.includes("429") || errorMsg.includes("quota")) {
          console.warn(`[AI-ANALYZE] Switching to next model due to server load...`);
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
