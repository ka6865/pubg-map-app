import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// [AI-SUMMARY] 총기 코드명을 한글명으로 변환하는 매핑 테이블
const WEAPON_MAP: { [key: string]: string } = {
  "WeapAKM_C": "AKM", "WeapBerylM762_C": "베릴 M762", "WeapM416_C": "M416", "WeapSCAR-L_C": "SCAR-L",
  "WeapAUG_C": "AUG", "WeapG36C_C": "G36C", "WeapQBZ95_C": "QBZ", "WeapK2_C": "K2", "WeapAce32_C": "ACE32",
  "WeapM16A4_C": "M16A4", "WeapMk47Mutant_C": "뮤턴트", "WeapSKS_C": "SKS", "WeapSLR_C": "SLR",
  "WeapMk14_C": "Mk14", "WeapMini14_C": "미니14", "WeapQBU88_C": "QBU", "WeapVSS_C": "VSS",
  "WeapDragunov_C": "드라구노프", "WeapKar98k_C": "Kar98k", "WeapM24_C": "M24", "WeapAWM_C": "AWM",
  "WeapMosinNagant_C": "모신나강", "WeapWin1894_C": "윈체스터", "WeapLynxAMR_C": "링스 AMR",
  "WeapUZI_C": "마이크로 UZI", "WeapUMP45_C": "UMP45", "WeapVector_C": "벡터", "WeapTommyGun_C": "토미건",
  "WeapBizonPP19_C": "비존", "WeapMP5K_C": "MP5K", "WeapP90_C": "P90", "WeapJS9_C": "JS9",
  "WeapS12K_C": "S12K", "WeapS1897_C": "S1897", "WeapS686_C": "S686", "WeapDBS_C": "DBS",
  "WeapM249_C": "M249", "WeapDP28_C": "DP-28", "WeapMG3_C": "MG3", "WeapCrossbow_C": "석궁",
  "WeapPanzerfaust100_C": "판저파우스트", "PanzerFaust100M Projectile": "판저파우스트",
  "WeapM79_C": "M79", "WeapGrenade_C": "수류탄", "ProjGrenade": "수류탄", "ProjGrenade_C": "수류탄",
  "WeapMolotov_C": "화염병", "ProjMolotov_C": "화염병", "ProjMolotov_DamageField_InWater_C": "화염병",
  "Item_Weapon_FlashBang_C": "섬광탄", "Item_Weapon_C4_C": "C4", "Thompson": "토미건",
  // 추가 무기 ID 보완
  "WeapHK416_C": "HK416", "WeapFAMAS_C": "FAMAS", "WeapMP9_C": "MP9",
  "WeapRhino_C": "리볼버", "WeapDesertEagle_C": "데저트이글", "WeapP1911_C": "P1911",
  "WeapP92_C": "P92", "WeapNagantM1895_C": "나강 권총", "WeapSawnoff_C": "소드오프",
  "WeapFlareGun_C": "플레어건", "Mortar_Proj_C": "박격포", "WeapGrenadeLauncher_C": "유탄발사기",
};

// [AI-SUMMARY] 무기 코드명 → 한글명 변환 (unknown 케이스 처리 강화)
const getWeaponName = (id: string): string => {
  if (!id || id === "None" || id === "null") return "알 수 없음";
  if (WEAPON_MAP[id]) return WEAPON_MAP[id];
  
  const lowerId = id.toLowerCase();
  // 차량/로드킬 처리
  if (lowerId.includes("brdm") || lowerId.includes("uaz") || lowerId.includes("dacia") || 
      lowerId.includes("buggy") || lowerId.includes("motorcycle") || lowerId.includes("pony") ||
      lowerId.includes("pico") || lowerId.includes("blanc") || lowerId.includes("mirado")) {
    return "차량 (로드킬)";
  }
  if (lowerId.includes("panzerfaust")) return "판저파우스트";
  if (lowerId.includes("punch") || lowerId.includes("melee")) return "주먹결투";
  if (lowerId.includes("pan") || lowerId.includes("machete") || lowerId.includes("sickle")) return "근접 무기";

  // "Damage_Gun", "Damage_BlueZone" 등 카테고리 코드 처리
  if (id.startsWith("Damage_")) {
    const map: Record<string, string> = {
      Damage_BlueZone: "자기장", Damage_RedZone: "폭격", Damage_Fall: "낙하",
      Damage_Drowning: "익사", Damage_OutsidePlayZone: "자기장", Damage_Explosion_RedZone: "폭격",
      Damage_VehicleHit: "차량 (로드킬)", Damage_VehicleCrash: "차량 추돌", Damage_Fire: "화염병",
    };
    return map[id] || id.replace("Damage_", "").replace(/_/g, " ");
  }

  // WeapXxx_C 패턴: Xxx만 추출
  return id.replace(/^Weap/, "").replace(/_C$/, "").replace(/_/g, " ");
};

// [AI-SUMMARY] 텔레메트리 이벤트에서 무기 코드명을 안정적으로 추출
// ⚠️ LogPlayerKillV2(v2): 무기/거리 정보가 killerDamageInfo 하위 객체에 중첩되어 있음
// LogPlayerKill(v1) / LogPlayerMakeDBNO: 최상위 필드에 위치
const extractWeaponId = (k: any): string => {
  return (
    k.killerDamageInfo?.damageCauserName ||   // v2 (LogPlayerKillV2) - 중첩 구조
    k.finisherDamageInfo?.damageCauserName ||  // v2 피니시 데미지
    k.damageCauserName ||                      // v1 (LogPlayerKill / DBNO)
    "알 수 없음"
  );
};

// [AI-SUMMARY] 텔레메트리 이벤트에서 교전 거리 추출 (cm → m 변환)
// ⚠️ LogPlayerKillV2: distance도 killerDamageInfo 하위에 위치
const extractDistance = (k: any): number => {
  const rawDist =
    k.killerDamageInfo?.distance ??   // LogPlayerKillV2 중첩 구조
    k.finisherDamageInfo?.distance ??
    k.distance ??                      // LogPlayerKill(v1) / DBNO 최상위
    0;
  // PUBG 텔레메트리 거리값은 cm 단위이므로 100으로 나눠 m로 변환
  return Math.round(rawDist / 100);
};

// [AI-SUMMARY] 맵코드 → 한글명 매핑
const MAP_NAME_KR: Record<string, string> = {
  Erangel_Main: "에란겔",
  Baltic_Main: "에란겔",
  Desert_Main: "미라마",
  Tiger_Main: "태이고",
  Neon_Main: "론도",
  Savage_Main: "사녹",
  Summer_Main: "사녹",
  DihorOtok_Main: "비켄디",
  Chimera_Main: "파라모",
  Kiki_Main: "데스턴",
  Heaven_Main: "헤이븐",
  Summerland_Main: "카라킨",
};

export async function POST(request: Request) {
  console.log("[AI-SUMMARY] 초정밀 분석 요청 시작 (Telemetry Mode)");
  try {
    const { matchIds, nickname, platform } = await request.json();

    if (!matchIds || matchIds.length === 0) {
      return NextResponse.json({ error: "매치 데이터가 없습니다." }, { status: 400 });
    }

    const apiKey = (process.env.PUBG_API_KEY || "").split(" ")[0];
    const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;

    if (!geminiApiKey) {
      return NextResponse.json({ error: "Gemini API 키가 설정되지 않았습니다." }, { status: 500 });
    }

    const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/vnd.api+json" };

    // 1. 매치 상세 데이터 및 텔레메트리 로그 분석 (최대 10판)
    const targetMatchIds = matchIds.slice(0, 10);
    const detailedMatches: any[] = [];

    for (const [index, id] of targetMatchIds.entries()) {
      try {
        console.log(`[AI-SUMMARY] (${index + 1}/${targetMatchIds.length}) 매치 ${id} 분석 중...`);

        const res = await fetch(`https://api.pubg.com/shards/${platform}/matches/${id}`, { headers });
        if (!res.ok) {
          console.warn(`[AI-SUMMARY] 매치 ${id} API 응답 실패: ${res.status}`);
          continue;
        }

        const data = await res.json();

        // 이벤트 모드 맵 감지 (Desert_Main_BinarySpot 등) → 분석 대상에서 제외
        const rawMapName: string = data.data?.attributes?.mapName || "";
        const isOfficialMap = [
          "Erangel_Main", "Baltic_Main", "Desert_Main", "Savage_Main", "Summer_Main",
          "DihorOtok_Main", "Tiger_Main", "Kiki_Main", "Neon_Main",
          "Chimera_Main", "Heaven_Main", "Summerland_Main",
        ].includes(rawMapName);

        if (!isOfficialMap) {
          console.log(`[AI-SUMMARY] 매치 ${id} 이벤트 맵(${rawMapName}) 제외`);
          continue;
        }

        // 닉네임 기반 participant 조회 (대소문자 무시 매칭)
        const lowerNickname = nickname.toLowerCase();
        const participant = data.included?.find(
          (inc: any) =>
            inc.type === "participant" &&
            inc.attributes?.stats?.name?.toLowerCase() === lowerNickname
        );

        if (!participant) {
          console.warn(`[AI-SUMMARY] 매치 ${id}에서 플레이어 '${nickname}'를 찾지 못했습니다.`);
          continue;
        }

        // 플레이어의 고유 AccountId 추출 (이름보다 정확한 매칭을 위해)
        const accountId = participant.attributes.stats.playerId;

        // 텔레메트리 URL 추출: type==="asset" 중 URL에 "telemetry" 포함된 것
        const telemetryAsset = data.included?.find(
          (inc: any) =>
            inc.type === "asset" &&
            (inc.attributes?.name === "telemetry" || inc.attributes?.URL?.toLowerCase().includes("telemetry"))
        );
        const telemetryUrl = telemetryAsset?.attributes?.URL;

        let killDetails: any[] = [];
        let dbnoDetails: any[] = [];

        if (telemetryUrl) {
          try {
            console.log(`[AI-SUMMARY] 텔레메트리 로딩: ${telemetryUrl.slice(0, 70)}...`);

            // PUBG 텔레메트리는 GZIP 압축 파일 - Accept-Encoding 명시
            const telRes = await fetch(telemetryUrl, {
              headers: { "Accept-Encoding": "gzip, deflate" },
            });

            if (telRes.ok) {
              const arrayBuffer = await telRes.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);

              let telDataStr = "";
              // GZIP 매직 바이트(0x1f 0x8b) 감지 후 해제
              if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
                const zlib = await import("node:zlib");
                const decompressed = zlib.gunzipSync(buffer);
                telDataStr = decompressed.toString("utf-8");
              } else {
                telDataStr = buffer.toString("utf-8");
              }

              const telData: any[] = JSON.parse(telDataStr);

              if (Array.isArray(telData)) {
                // [킬 이벤트] LogPlayerKill (v1) + LogPlayerKillV2 (v2) 모두 처리
                const killEvents = telData.filter((e: any) => {
                  const type = e._T;
                  if (type !== "LogPlayerKill" && type !== "LogPlayerKillV2") return false;

                  // v1: attacker 필드 / v2: killer 필드
                  const attacker = e.killer || e.attacker;
                  if (!attacker) return false;

                  // 닉네임 또는 accountId로 이중 매칭 (대소문자 무시)
                  const nameMatch = attacker.name?.toLowerCase() === lowerNickname;
                  const idMatch = attacker.accountId === accountId;
                  return nameMatch || idMatch;
                });

                killDetails = killEvents.map((k: any) => {
                  const weaponId = extractWeaponId(k);
                  const distanceM = extractDistance(k);
                  const reason =
                    k.killerDamageInfo?.damageReason ||
                    k.finisherDamageInfo?.damageReason ||
                    k.damageReason ||
                    k.killerDamageReason ||
                    "";
                  const isHeadshot = reason === "HeadShot" || reason === "ArmShot"; // 헤드샷 여부

                  return {
                    type: "킬",
                    weapon: getWeaponName(weaponId),
                    weaponRaw: weaponId, // 디버그용 원본
                    distanceM, // m 단위 거리 (가독성)
                    isHeadshot,
                    reason: reason || "일반",
                    victimName: k.victim?.name || "Unknown",
                  };
                });

                // [기절 이벤트] LogPlayerMakeDBNO 처리
                const dbnoEvents = telData.filter((e: any) => {
                  const type = e._T;
                  if (type !== "LogPlayerMakeDBNO") return false;
                  const attacker = e.attacker;
                  if (!attacker) return false;
                  return attacker.name?.toLowerCase() === lowerNickname || attacker.accountId === accountId;
                });

                dbnoDetails = dbnoEvents.map((k: any) => {
                  const weaponId = extractWeaponId(k);
                  return {
                    type: "기절",
                    weapon: getWeaponName(weaponId),
                    weaponRaw: weaponId,
                    distanceM: extractDistance(k),
                    victimName: k.victim?.name || "Unknown",
                  };
                });

                console.log(
                  `[AI-SUMMARY] 매치 ${id}: 킬 ${killDetails.length}건 / 기절 ${dbnoDetails.length}건 (텔레메트리 이벤트 총 ${telData.length}건)`
                );
              }
            } else {
              console.warn(`[AI-SUMMARY] 텔레메트리 fetch 실패 (${id}): ${telRes.status}`);
            }
          } catch (telErr) {
            console.error(`[AI-SUMMARY] 텔레메트리 파싱 오류 (${id}):`, telErr);
          }
        } else {
          console.warn(`[AI-SUMMARY] 매치 ${id}: 텔레메트리 URL 없음`);
        }

        const stats = { ...participant.attributes.stats };

        const deathTypeMap: Record<string, string> = {
          alive: "생존",
          byplayer: "적 플레이어에게 사망",
          byzone: "자기장 사망",
          bluezone: "자기장 사망",
          suicide: "자살",
          falling: "낙사",
          vehicle: "차량 폭발/로드킬",
          logout: "로그아웃",
        };

        detailedMatches.push({
          matchId: id,
          mapName: MAP_NAME_KR[data.data.attributes.mapName as string] || data.data.attributes.mapName,
          gameMode: data.data.attributes.gameMode,
          createdAt: data.data.attributes.createdAt,
          stats: {
            kills: stats.kills,
            assists: stats.assists,
            DBNOs: stats.DBNOs,
            damageDealt: Math.floor(stats.damageDealt),
            winPlace: stats.winPlace,
            timeSurvived: stats.timeSurvived,
            headshotKills: stats.headshotKills,
            longestKill: Math.round((stats.longestKill || 0) * 100) / 100, // m 단위 정밀도
            heals: stats.heals,
            boosts: stats.boosts,
            deathType: deathTypeMap[stats.deathType] || stats.deathType,
            walkDistance: Math.floor(stats.walkDistance),
            rideDistance: Math.floor(stats.rideDistance),
            swimDistance: Math.floor(stats.swimDistance),
            revives: stats.revives,
          },
          killDetails,   // 텔레메트리 킬 상세 (무기, 거리, 헤드샷 여부)
          dbnoDetails,   // 텔레메트리 기절 상세
        });

        // API Rate Limit 방지 (300ms 딜레이)
        if (index < targetMatchIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      } catch (err: any) {
        console.error(`[AI-SUMMARY] 매치 ${id} 처리 오류:`, err.message);
      }
    }

    if (detailedMatches.length === 0) {
      return NextResponse.json({ error: "상세 매치 정보를 가져올 수 없습니다." }, { status: 404 });
    }

    // 2. 데이터 집계 및 요약 (AI 프롬프트 토큰 절약을 위해 전처리)
    const totalKills = detailedMatches.reduce((acc, m) => acc + m.stats.kills, 0);
    const totalDamage = detailedMatches.reduce((acc, m) => acc + m.stats.damageDealt, 0);
    const totalDBNOs = detailedMatches.reduce((acc, m) => acc + m.stats.DBNOs, 0);
    const totalHeadshotKills = detailedMatches.reduce((acc, m) => acc + m.stats.headshotKills, 0);
    const avgDamage = Math.floor(totalDamage / detailedMatches.length);
    const avgWinPlace = detailedMatches.reduce((acc, m) => acc + m.stats.winPlace, 0) / detailedMatches.length;

    // 총기별 킬 횟수 집계
    const allKillDetails = detailedMatches.flatMap((m) => m.killDetails);
    const allDbnoDetails = detailedMatches.flatMap((m) => m.dbnoDetails);

    const weaponKillCount: Record<string, number> = {};
    for (const k of allKillDetails) {
      if (k.weapon && k.weapon !== "알 수 없음") {
        weaponKillCount[k.weapon] = (weaponKillCount[k.weapon] || 0) + 1;
      }
    }

    // 총기별 기절 횟수 집계
    const weaponDbnoCount: Record<string, number> = {};
    for (const k of allDbnoDetails) {
      if (k.weapon && k.weapon !== "알 수 없음") {
        weaponDbnoCount[k.weapon] = (weaponDbnoCount[k.weapon] || 0) + 1;
      }
    }

    // 교전 거리 분포 (근접 0~50m, 중거리 50~200m, 장거리 200m+)
    const distBuckets = { close: 0, mid: 0, long: 0 };
    for (const k of allKillDetails) {
      if (k.distanceM <= 50) distBuckets.close++;
      else if (k.distanceM <= 200) distBuckets.mid++;
      else distBuckets.long++;
    }

    // 헤드샷 킬 비율
    const headshotRate =
      allKillDetails.length > 0
        ? `${Math.round((allKillDetails.filter((k) => k.isHeadshot).length / allKillDetails.length) * 100)}%`
        : "0%";

    // 데스 유형 분포
    const deathTypeMap: Record<string, number> = {};
    for (const m of detailedMatches) {
      const dt = m.stats.deathType || "알 수 없음";
      deathTypeMap[dt] = (deathTypeMap[dt] || 0) + 1;
    }

    // 3. AI 프롬프트 구성 (정제된 요약 데이터만 전달 - 토큰 절약)
    const systemPrompt = `당신은 대한민국 최고의 배틀그라운드 프로팀 메인 코치입니다.
최근 ${detailedMatches.length}경기의 상세 데이터와 텔레메트리 킬 로그를 바탕으로, 초정밀 전략 분석 리포트를 작성하세요.

[분석 핵심 지침]
1. 총기 숙련도 분석 (Telemetry 기반):
   - '총기별 킬/기절 횟수'를 보고 주력 총기와 보조 총기를 판단하세요.
   - 예: "M416로 8킬을 기록하여 중거리 AR 매커니즘이 뛰어납니다."
2. 교전 거리 분석:
   - 근접(0-50m) / 중거리(50-200m) / 장거리(200m+) 비율로 플레이 스타일을 진단하세요.
3. 헤드샷 비율 진단:
   - 헤드샷 비율이 낮으면 조준 교정 훈련을 권고하세요.
4. KDA·데미지·생존 운영 종합 진단.
5. 데스 유형 분석: 자기장사(bluezone/byzone 등) 비율이 높으면 운영 문제, 적 플레이어 사망(byplayer)이 높으면 교전 판단력 문제.

[작성 및 출력 절대 규칙]
1. 언어: 반드시 100% 자연스러운 한국어(한글)로만 작성하세요. 
2. 🛑 ⚠️ 경고: '优秀'(우수한), '稳定的'(안정적인) 같은 한자(중국어)나 'mechanism', 'bluezone' 등 쓰잘데기 없는 영단어를 단 한 글자도 섞지 마세요. 어색한 번역체 대신 "우수합니다", "안정적인" 같은 정확한 한국어로 표현하세요. (단, M416, AKM 같은 공식 무기 코드는 예외)
3. 마크다운(##, **굵게**, 리스트)으로 전문적이고 가독성 높은 리포트 형식을 유지하세요.
4. 구체적인 숫자와 한글 변환된 총기명을 반드시 활용해서 설명하세요.`;

    const userPrompt = `## 플레이어: ${nickname}
## 분석 기간: 최근 ${detailedMatches.length}경기

### 📊 종합 지표
| 항목 | 수치 |
|---|---|
| 총 킬 | ${totalKills}킬 |
| 총 기절 | ${totalDBNOs}회 |
| 평균 딜량 | ${avgDamage} |
| 평균 순위 | ${avgWinPlace.toFixed(1)}위 |
| 헤드샷 킬 비율 | ${headshotRate} |

### 🔫 총기별 킬 횟수 (텔레메트리 기반)
${JSON.stringify(weaponKillCount, null, 2)}

### 💥 총기별 기절 횟수
${JSON.stringify(weaponDbnoCount, null, 2)}

### 📏 교전 거리 분포
- 근접전 (0~50m): ${distBuckets.close}킬
- 중거리전 (50~200m): ${distBuckets.mid}킬
- 장거리전 (200m+): ${distBuckets.long}킬

### ☠️ 사망 유형 분포
${JSON.stringify(deathTypeMap, null, 2)}

### 📋 경기별 상세 요약 (${detailedMatches.length}판)
${detailedMatches
  .map(
    (m, i) =>
      `[${i + 1}판] ${m.mapName} / ${m.gameMode} / ${m.stats.winPlace}위 / ${m.stats.kills}킬 ${m.stats.assists}어시 / 딜량 ${m.stats.damageDealt} / 사망: ${m.stats.deathType}` +
      (m.killDetails.length > 0
        ? ` / 킬 무기: ${m.killDetails.map((k: any) => `${k.weapon}(${k.distanceM}m)`).join(", ")}`
        : " / 킬 없음")
  )
  .join("\n")}`;

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    let analysis = "";

    // 2026년 기준 안정적인 모델 폴백 리스트
    const modelsToTry = [
      "gemini-flash-latest",
      "gemini-2.5-flash",
      "gemini-3.1-flash-lite-preview",
      "gemini-pro-latest"
    ];

    for (const modelName of modelsToTry) {
      try {
        console.log(`[AI-SUMMARY] Attempting summary with ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
        analysis = result.response.text();
        
        if (analysis) break;
      } catch (err: any) {
        const errorMsg = err.message || "";
        console.warn(`[AI-SUMMARY] ${modelName} failed: ${errorMsg}`);
        
        if (errorMsg.includes("503") || errorMsg.includes("Service Unavailable") || 
            errorMsg.includes("429") || errorMsg.includes("quota")) {
          continue; // 다음 모델로 재시도
        }
        throw err;
      }
    }
    
    if (!analysis) throw new Error("분석 결과를 생성할 수 없습니다.");
    if (!analysis) throw new Error("결과 생성 실패");
    
    return NextResponse.json({ analysis });
  } catch (error: any) {
    console.error("[AI-SUMMARY] 치명적 에러:", error);
    return NextResponse.json({ error: error.message || "오류 발생" }, { status: 500 });
  }
}
