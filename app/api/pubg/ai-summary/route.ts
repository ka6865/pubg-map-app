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
  "WeapHK416_C": "M416", "WeapFAMAS_C": "FAMAS", "WeapMP9_C": "MP9",
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
    const { matchIds, nickname, platform, coachingStyle = "spicy" } = await request.json();

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
        let myLateBluezoneDamage = 0;
        let totalMatchDamageTaken = 0;
        let teammateDistancesAtDeath: any = null;
        const combatPressure = { totalHits: 0, uniqueVictims: new Set<string>(), maxHitDistance: 0, utilityDamage: 0, utilityHits: 0 };
        let matchStartTime: number | null = null;
        const playerPositions: Record<string, { time: string, x: number, y: number }[]> = {};

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
                // 매치 시작 및 팀원 위치 수집
                telData.forEach(e => {
                  if (e._T === "LogMatchStart") matchStartTime = new Date(e._D).getTime();
                  if (e._T === "LogPlayerPosition" && e.character) {
                    const name = e.character.name;
                    if (!playerPositions[name]) playerPositions[name] = [];
                    playerPositions[name].push({ time: e._D, x: e.character.location.x, y: e.character.location.y });
                  }
                });

                // 거리 계산 헬퍼 함수
                const getTeammateDistances = (targetName: string, eventTime: string, sourceX: number, sourceY: number) => {
                  const distances: Record<string, number> = {};
                  const eventTs = new Date(eventTime).getTime();
                  Object.entries(playerPositions).forEach(([name, positions]) => {
                    if (name === targetName) return;
                    let closestPos = positions[0];
                    let minDiff = Infinity;
                    positions.forEach(p => {
                      const diff = Math.abs(new Date(p.time).getTime() - eventTs);
                      if (diff < minDiff) { minDiff = diff; closestPos = p; }
                    });
                    if (closestPos) {
                      const dist = Math.sqrt(Math.pow(sourceX - closestPos.x, 2) + Math.pow(sourceY - closestPos.y, 2));
                      distances[name] = Math.round(dist / 100);
                    }
                  });
                  return distances;
                };

                // 자기장 피해 분석 (후반 피해 누적)
                telData.forEach(e => {
                  if (e._T === "LogPlayerTakeDamage" && e.victim?.name?.toLowerCase() === lowerNickname) {
                    if (e.damageTypeCategory === "Damage_BlueZone" || e.damageTypeCategory === "Damage_OutsidePlayZone") {
                      if (matchStartTime) {
                        const elapsed = new Date(e._D).getTime() - matchStartTime;
                        if (elapsed >= 720000) myLateBluezoneDamage += (e.damage || 0);
                      }
                    } else if (e.attacker) {
                      // 자기장이 아닌 일반 교전 피해 합산
                      totalMatchDamageTaken += (e.damage || 0);
                    }
                  }
                });

                // [V3] 교전 압박 및 투척물 분석
                telData.forEach(e => {
                  if (e._T === "LogPlayerTakeDamage" && e.attacker && (e.attacker.name?.toLowerCase() === lowerNickname || e.attacker.accountId === accountId)) {
                    if (e.victim && e.victim.name !== nickname) {
                      combatPressure.totalHits++;
                      combatPressure.uniqueVictims.add(e.victim.name);
                      if (e.attacker.location && e.victim.location) {
                        const dx = e.attacker.location.x - e.victim.location.x;
                        const dy = e.attacker.location.y - e.victim.location.y;
                        const dist = Math.sqrt(dx * dx + dy * dy) / 100;
                        if (dist > combatPressure.maxHitDistance) combatPressure.maxHitDistance = Math.round(dist);
                      }
                      const isUtility = ["Item_Weapon_Grenade_C", "ProjGrenade_C", "WeapMolotov_C", "ProjMolotov_C", "Item_Weapon_FlashBang_C"].includes(e.damageCauserName);
                      if (isUtility) {
                        combatPressure.utilityDamage += (e.damage || 0);
                        combatPressure.utilityHits++;
                      }
                    }
                  }
                });

                // 사망 시점 팀원 거리 파악
                const myDeathEvent = telData.find(e => 
                  (e._T === "LogPlayerKill" || e._T === "LogPlayerKillV2") && 
                  e.victim?.name?.toLowerCase() === lowerNickname
                );
                if (myDeathEvent && myDeathEvent.victim?.location) {
                  teammateDistancesAtDeath = getTeammateDistances(nickname, myDeathEvent._D, myDeathEvent.victim.location.x, myDeathEvent.victim.location.y);
                }

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

        // [V3] 매치 백분위 계산
        const fullParticipants = data.included.filter((item: any) => item.type === "participant");
        const meaningfulParticipants = fullParticipants.filter((p: any) => {
          const s = p.attributes.stats;
          return s.damageDealt > 0 || s.timeSurvived > 60;
        });

        const sortedDamage = [...meaningfulParticipants].sort((a: any, b: any) => b.attributes.stats.damageDealt - a.attributes.stats.damageDealt);
        const myDamageRankRaw = sortedDamage.findIndex((p: any) => p.attributes.stats.playerId === accountId);
        const myDamageRank = myDamageRankRaw === -1 ? meaningfulParticipants.length + 1 : myDamageRankRaw + 1;
        const myDamagePercentile = Math.round(((meaningfulParticipants.length - myDamageRank) / (meaningfulParticipants.length || 1)) * 100);

        const sortedKills = [...meaningfulParticipants].sort((a: any, b: any) => b.attributes.stats.kills - a.attributes.stats.kills);
        const myKillRankRaw = sortedKills.findIndex((p: any) => p.attributes.stats.playerId === accountId);
        const myKillRank = myKillRankRaw === -1 ? meaningfulParticipants.length + 1 : myKillRankRaw + 1;

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
          lateBluezoneDamage: myLateBluezoneDamage,
          damageTaken: totalMatchDamageTaken,
          teammateDistancesAtDeath,
          combatPressure: {
            totalHits: combatPressure.totalHits,
            uniqueVictims: Array.from(combatPressure.uniqueVictims),
            maxHitDistance: combatPressure.maxHitDistance,
            utilityDamage: combatPressure.utilityDamage,
            utilityHits: combatPressure.utilityHits
          },
          myRank: {
            damageRank: myDamageRank,
            damagePercentile: myDamagePercentile,
            killRank: myKillRank
          },
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

    // [NEW] 전술 패턴 집계 (고립, 자기장, 저격)
    let totalLateBluezoneDamage = 0;
    let totalOverallDamageTaken = 0;
    let isolatedDeathCount = 0;
    let totalDeathDistanceSum = 0;
    let deathDistanceCount = 0;
    const srDmrWeapons = ["Kar98k", "M24", "AWM", "Mosin Nagant", "Dragunov", "Mini14", "SLR", "SKS", "Mk12", "QBU", "Mk14", "VSS"];
    let totalSnipedEnemies = 0;
    let totalKnockedBySniper = 0;
    
    // [V3 종합 지표]
    let totalV3Hits = 0;
    let totalV3UniqueVictims = 0;
    let maxV3Distance = 0;
    let totalV3UtilityHits = 0;
    let totalV3UtilityDamage = 0;
    let totalDamagePercentileSum = 0;
    let totalKillRankSum = 0;
    let bestKillRank = 999;

    detailedMatches.forEach(m => {
      totalLateBluezoneDamage += (m.lateBluezoneDamage || 0);
      totalOverallDamageTaken += (m.damageTaken || 0);
      
      // V3 지표 합산
      totalV3Hits += (m.combatPressure?.totalHits || 0);
      const matchVictims = m.combatPressure?.uniqueVictims?.length || 0;
      totalV3UniqueVictims += matchVictims;
      if ((m.combatPressure?.maxHitDistance || 0) > maxV3Distance) maxV3Distance = m.combatPressure.maxHitDistance;
      totalV3UtilityHits += (m.combatPressure?.utilityHits || 0);
      totalV3UtilityDamage += (m.combatPressure?.utilityDamage || 0);
      totalDamagePercentileSum += (m.myRank?.damagePercentile || 0);
      
      const currentKillRank = m.myRank?.killRank || 999;
      totalKillRankSum += currentKillRank;
      if (currentKillRank < bestKillRank) bestKillRank = currentKillRank;
      
      // 저격전 합산 (weaponRaw 필드 사용)
      const matchKills = m.killDetails.filter((k: any) => srDmrWeapons.some(w => k.weaponRaw?.includes(w))).length;
      const matchDbnos = m.dbnoDetails.filter((k: any) => srDmrWeapons.some(w => k.weaponRaw?.includes(w))).length;
      totalSnipedEnemies += (matchKills + matchDbnos);
      
      const matchKnockedBySniper = m.killDetails.filter((k: any) => k.victimName === nickname && srDmrWeapons.some(w => k.weaponRaw?.includes(w))).length;
      totalKnockedBySniper += matchKnockedBySniper;

      // 거리 분석 (사망 시)
      if (m.teammateDistancesAtDeath) {
        const distances = Object.values(m.teammateDistancesAtDeath) as number[];
        if (distances.length > 0) {
          const minDist = Math.min(...distances);
          totalDeathDistanceSum += minDist;
          deathDistanceCount++;
          if (minDist >= 150) isolatedDeathCount++;
        }
      }
    });

    const avgDeathDistance = deathDistanceCount > 0 ? Math.round(totalDeathDistanceSum / deathDistanceCount) : 0;
    const avgLateBluezoneDamage = Math.floor(totalLateBluezoneDamage / detailedMatches.length);
    const isolatedRate = detailedMatches.length > 0 ? Math.round((isolatedDeathCount / detailedMatches.length) * 100) : 0;
    const overallTradeEfficiency = totalOverallDamageTaken > 0 ? (totalDamage / totalOverallDamageTaken).toFixed(2) : (totalDamage / 1).toFixed(2);
    const avgDamagePercentile = Math.round(totalDamagePercentileSum / (detailedMatches.length || 1));
    const avgKillRank = (totalKillRankSum / (detailedMatches.length || 1)).toFixed(1);

    // 3. AI 프롬프트 구성
    const mildPrompt = `
당신은 배틀그라운드 유저의 성장을 진심으로 응원하는 '다정한 실력파 코치'입니다.
10경기의 데이터를 바탕으로 차분하게 전술적 피드백을 주십시오.
- 칭찬 포인트: 교전 효율이 좋거나, 기절(DBNO) 지원이 많거나, 교전 압박(Hits)이 높은 부분 등을 꼭 찾아내어 독려하십시오.
- 개선 포인트: 부족한 부분도 따뜻하게, 하지만 실무적으로 조언하십시오.
- 말투: "~해요", "~군요"와 같은 부드러운 선배/코치 어투를 사용하십시오.
`.trim();

    const spicyPrompt = `
당신은 아주 냉정하고 날카로운 실전형 '독설가'이자 '팩트 폭격기'입니다.
10경기의 데이터를 통해 플레이어의 실책과 전술적 무능을 낱낱이 파헤쳐 뼈를 때리는 분석을 가하십시오.
- 핵심 기조: "실력 없는 친절함은 배그에서 죽음뿐이다."
- 강조 포인트: 낮은 킬 대비 높은 데미지(결단력 부족), 고립사 빈도, 낮은 투척물 효율 등을 날카롭게 비판하십시오.
- 말투: 군대 어투가 아닌, 차갑고 시니컬한 말투를 사용하십시오. "~해", "~이야?" 보다는 "~하죠", "~했네요" 정도로 끝내되 내용은 매우 공격적이고 날카로워야 합니다.
`.trim();

    const debatePrompt = `
당신은 '다정한 코치(착한맛)'와 '팩트 폭격기(매운맛)' 두 사람의 대화를 진행하는 사회자이자 두 캐릭터 그 자체입니다.
제시된 10경기의 데이터를 바탕으로 두 사람이 플레이어의 실력에 대해 '끝장 토론'을 벌이는 시나리오를 작성하십시오.

대화 규칙:
1. 시작: '착한맛 코치'가 데이터에서 칭찬할 점을 찾아내며 부드럽게 대화를 시작합니다.
2. 반박: '매운맛 폭격기'가 즉시 그 칭찬을 반박하며, 데이터 이면에 숨겨진 실책이나 고질적인 문제점을 날카롭게 지적합니다.
3. 전개: 위와 같은 방식으로 서로 의견을 2~3회 주고받습니다. (상대방의 의견을 인용하며 논리적으로 공격/방어하세요)
4. 결론: 마지막에는 두 사람이 합의한 '플레이어를 위한 최종 생존 지침'을 3가지로 요약하여 제시합니다.

캐릭터 말투:
- 착한맛 코치: "~해요", "~군요" (부드럽고 격려하는 따뜻한 말투)
- 매운맛 폭격기: "~죠", "~한가요?" (차갑고 시니컬하며, 비꼬는 듯한 느낌을 주는 날카로운 말투. 군대식은 지양)

형식:
[착한맛 코치]: (대사)
[매운맛 폭격기]: (대사)
...
[최종 합의 결론]: (내용)
`.trim();

    const systemContext = `당신은 플레이어의 고질적인 습관을 찾아내는 '1:1 전술 멘토'입니다. 
출력 언어는 100% 한국어여야 합니다.

결과 구성 규칙:
1. 선택된 코칭 스타일에 맞춰 답변하십시오.
2. 만약 스타일이 'debate'라면 위의 대화 규칙을 엄격히 준수하십시오.
`;

    let finalPrompt = "";
    if (coachingStyle === "mild") finalPrompt = `${systemContext}\n\n${mildPrompt}`;
    else if (coachingStyle === "spicy") finalPrompt = `${systemContext}\n\n${spicyPrompt}`;
    else if (coachingStyle === "debate") finalPrompt = `${systemContext}\n\n${debatePrompt}`;
    else finalPrompt = `${systemContext}\n\n${spicyPrompt}`;

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
| 평균 사망 시 팀원 거리 | ${avgDeathDistance}m |
| 고립 사망률 | ${isolatedRate}% |
| 내 평균 후반 자기장 피해 | ${avgLateBluezoneDamage}HP |
| 종합 교전 효율(Trade) | ${overallTradeEfficiency} (전체 평균) |
| 내 평균 매치 백분위 | 상위 ${100 - avgDamagePercentile}% |
| 10경기 평균 킬 순위 | ${avgKillRank}위 (최고 ${bestKillRank}위) |
| 10경기 총 교전 압박 | ${totalV3Hits}회 적중 / ${totalV3UniqueVictims}명 압박 |
| 역대 최장거리 유효타 | ${maxV3Distance}m |
| 종합 투척물 효율 | ${totalV3UtilityHits}회 적중 / 누적 ${Math.round(totalV3UtilityDamage)}딜 |
| 종합 저격 성적 | 성공 ${totalSnipedEnemies} / 피격 ${totalKnockedBySniper} |

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

    const modelsToTry = [
      "gemini-3.1-flash-lite-preview",
      "gemini-3-flash-preview",
      "gemini-2.5-flash-lite",
      "gemma-3-27b"
    ];

    for (const modelName of modelsToTry) {
      try {
        console.log(`[AI-SUMMARY] Attempting streaming summary with ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName });
        
        // 스트리밍 요청으로 변경
        const result = await model.generateContentStream(`${finalPrompt}\n\n${userPrompt}`);
        
        // 가독성 있는 스트림 응답 생성
        const stream = new ReadableStream({
          async start(controller) {
            for await (const chunk of result.stream) {
              const chunkText = chunk.text();
              controller.enqueue(new TextEncoder().encode(chunkText));
            }
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Transfer-Encoding": "chunked",
          },
        });
      } catch (err: any) {
        const errorMsg = err.message || "";
        console.warn(`[AI-SUMMARY] ${modelName} failed: ${errorMsg}`);
        if (errorMsg.includes("503") || errorMsg.includes("429") || errorMsg.includes("404")) {
          continue;
        }
        throw err;
      }
    }
    
    throw new Error("분석 스트림을 생성할 수 없습니다.");
  } catch (error: any) {
    console.error("[AI-SUMMARY] 치명적 에러:", error);
    return NextResponse.json({ error: error.message || "오류 발생" }, { status: 500 });
  }
}
