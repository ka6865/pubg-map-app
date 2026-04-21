// 파일 위치: app/api/pubg/match/route.ts
import { NextResponse } from "next/server";

const MAP_NAMES: Record<string, string> = {
  Erangel_Main: "에란겔",
  Baltic_Main: "에란겔",
  Desert_Main: "미라마",
  Savage_Main: "사녹",
  Summer_Main: "사녹",
  DihorOtok_Main: "비켄디",
  Tiger_Main: "태이고",
  Kiki_Main: "데스턴",
  Neon_Main: "론도",
  Chimera_Main: "파라모",
  Heaven_Main: "헤이븐",
  Summerland_Main: "카라킨",
};

// [MATCH] 공식 맵 코드 목록 (이에 포함되지 않으면 이벤트 모드로 판별)
const OFFICIAL_MAPS = new Set(Object.keys(MAP_NAMES));

/**
 * 이벤트 맵(Desert_Main_BinarySpot 등) 여부를 판별합니다.
 * 기준: MAP_NAMES에 없거나, mapName에 '_Main_' 형태의 추가 접미사가 있는 경우
 */
const isEventMap = (mapName: string): boolean => {
  if (OFFICIAL_MAPS.has(mapName)) return false;
  // _Main_XXX 패턴 (예: Desert_Main_BinarySpot, Erangel_Main_Floaties)
  if (/_Main_.+/.test(mapName)) return true;
  // 완전히 알 수 없는 맵 코드도 이벤트로 처리
  return true;
};

// [MATCH] 총기 코드명 → 한글명 변환
const WEAPON_MAP: Record<string, string> = {
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
  "WeapHK416_C": "M416",
};

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

  if (id.startsWith("Damage_")) {
    const m: Record<string, string> = {
      Damage_BlueZone: "자기장", Damage_RedZone: "폭격", Damage_Fall: "낙하", Damage_Drowning: "익사",
      Damage_OutsidePlayZone: "자기장", Damage_Explosion_RedZone: "폭격",
      Damage_VehicleHit: "차량 (로드킬)", Damage_VehicleCrash: "차량 추돌", Damage_Fire: "화염병",
    };
    return m[id] || id.replace("Damage_", "");
  }
  
  return id.replace(/^Weap/, "").replace(/_C$/, "").replace(/_/g, " ");
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId");
  const nickname = searchParams.get("nickname");
  const platform = searchParams.get("platform") || "steam";

  if (!matchId || !nickname)
    return NextResponse.json({ error: "파라미터가 부족합니다." }, { status: 400 });

  // 환경 변수에서 불필요한 공백 및 텍스트(예: "Rate Limit 10 RPM...")를 제거하고 진짜 토큰만 추출
  const apiKey = (process.env.PUBG_API_KEY || "").split(" ")[0];
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/vnd.api+json",
  };

  try {
    const res = await fetch(
      `https://api.pubg.com/shards/${platform}/matches/${matchId}`,
      { headers, next: { revalidate: 60 } }
    );
    if (!res.ok) throw new Error("매치 정보를 불러올 수 없습니다.");
    const data = await res.json();

    const matchAttr = data.data.attributes;

    // 이벤트 모드 맵 감지 → MatchCard가 조용히 렌더링 생략
    if (isEventMap(matchAttr.mapName)) {
      return NextResponse.json({ isEventMode: true, mapRaw: matchAttr.mapName });
    }

    const mapName = MAP_NAMES[matchAttr.mapName] || matchAttr.mapName;
    const createdAt = matchAttr.createdAt;

    // 1. 전체 참가자(Participant)와 팀 그룹(Roster)을 분류
    const participants = data.included.filter((item: any) => item.type === "participant");
    const rosters = data.included.filter((item: any) => item.type === "roster");

    // 2. 내 데이터 찾기 (대소문자 무시)
    const lowerNickname = nickname.toLowerCase();
    const myInfo = participants.find(
      (p: any) => p.attributes.stats.name?.toLowerCase() === lowerNickname
    );
    if (!myInfo) throw new Error("플레이어 데이터를 찾을 수 없습니다.");

    const accountId: string = myInfo.attributes.stats.playerId;

    // 3. 내가 속한 팀(Roster) 찾기
    const myRoster = rosters.find((r: any) =>
      r.relationships.participants.data.some((p: any) => p.id === myInfo.id)
    );

    // 4. 우리 팀원들 데이터만 추출
    let teamStats = [];
    if (myRoster) {
      teamStats = myRoster.relationships.participants.data
        .map((pRef: any) => {
          const member = participants.find((p: any) => p.id === pRef.id);
          return member ? member.attributes.stats : null;
        })
        .filter(Boolean);
    } else {
      teamStats = [myInfo.attributes.stats]; // 솔로일 경우 나 혼자
    }

    // 5. 팀 전체 킬/데미지 합산
    const totalTeamKills = teamStats.reduce((sum: number, member: any) => sum + member.kills, 0);
    const totalTeamDamage = teamStats.reduce((sum: number, member: any) => sum + member.damageDealt, 0);

    // 6. 텔레메트리에서 킬/기절 상세 데이터 추출 (AI 분석 품질 향상)
    let killDetails: any[] = [];
    let dbnoDetails: any[] = [];
    let itemUseDetails: any[] = [];
    let vehicleDetails: any[] = [];
    let damageDetails: any[] = [];
    let earlyBluezoneDamage = 0;
    let lateBluezoneDamage = 0;
    let matchStartTime: number | null = null;
    const playerPositions: Record<string, { time: string, x: number, y: number }[]> = {};

    try {
      const telemetryAsset = data.included?.find(
        (inc: any) =>
          inc.type === "asset" &&
          (inc.attributes?.name === "telemetry" || inc.attributes?.URL?.toLowerCase().includes("telemetry"))
      );
      const telemetryUrl = telemetryAsset?.attributes?.URL;

      if (telemetryUrl) {
        const telRes = await fetch(telemetryUrl, {
          headers: { "Accept-Encoding": "gzip, deflate" },
          next: { revalidate: 3600 }, // 텔레메트리는 변경 없으므로 1시간 캐시
        });

        if (telRes.ok) {
          const arrayBuffer = await telRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          let telDataStr = "";
          if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
            const zlib = await import("node:zlib");
            const decompressed = zlib.gunzipSync(buffer);
            telDataStr = decompressed.toString("utf-8");
          } else {
            telDataStr = buffer.toString("utf-8");
          }

          const telData: any[] = JSON.parse(telDataStr);
          const teamNames = new Set(teamStats.map((m: any) => m.name.toLowerCase()));
          const teamAccountIds = new Set(teamStats.map((m: any) => m.playerId));

          // 매치 시작 시간 확인
          const matchStartEvent = telData.find(e => e._T === "LogMatchStart");
          if (matchStartEvent) {
            matchStartTime = new Date(matchStartEvent._D).getTime();
          }

          if (Array.isArray(telData)) {
            // 위치 데이터 사전 수집 (팀원별)
            telData.forEach((e: any) => {
              if (e._T === "LogPlayerPosition" && e.character && (teamNames.has(e.character.name.toLowerCase()) || teamAccountIds.has(e.character.accountId))) {
                const name = e.character.name;
                if (!playerPositions[name]) playerPositions[name] = [];
                playerPositions[name].push({
                  time: e._D,
                  x: e.character.location.x,
                  y: e.character.location.y
                });
              }
            });

            // 특정 시점의 팀원 거리를 계산하는 헬퍼 함수
            const getTeammateDistances = (targetName: string, eventTime: string, sourceX: number, sourceY: number) => {
              const distances: Record<string, number> = {};
              const eventTs = new Date(eventTime).getTime();
              
              Object.entries(playerPositions).forEach(([name, positions]) => {
                if (name === targetName) return;
                
                // 이벤트 시점과 가장 가까운 위치 찾기
                let closestPos = positions[0];
                let minDiff = Infinity;
                
                positions.forEach(p => {
                  const diff = Math.abs(new Date(p.time).getTime() - eventTs);
                  if (diff < minDiff) {
                    minDiff = diff;
                    closestPos = p;
                  }
                });

                if (closestPos) {
                  const dx = sourceX - closestPos.x;
                  const dy = sourceY - closestPos.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  distances[name] = Math.round(dist / 100); // cm -> m
                }
              });
              return distances;
            };

            // 킬 이벤트 (v1 + v2)
            killDetails = telData
              .filter((e: any) => {
                const type = e._T;
                if (type !== "LogPlayerKill" && type !== "LogPlayerKillV2") return false;
                const attacker = e.killer || e.attacker;
                const victim = e.victim;
                
                // 팀원이 킬을 했거나(attacker), 팀원이 죽은 경우(victim) 모두 포함
                const isTeamAttacker = attacker && (teamNames.has(attacker.name?.toLowerCase()) || teamAccountIds.has(attacker.accountId));
                const isTeamVictim = victim && (teamNames.has(victim.name?.toLowerCase()) || teamAccountIds.has(victim.accountId));
                
                return isTeamAttacker || isTeamVictim;
              })
              .map((k: any) => {
                const weaponId =
                  k.killerDamageInfo?.damageCauserName ||
                  k.finisherDamageInfo?.damageCauserName ||
                  k.damageCauserName ||
                  k.killerDamageCauserName ||
                  "알 수 없음";

                const reason =
                  k.killerDamageInfo?.damageReason ||
                  k.finisherDamageInfo?.damageReason ||
                  k.damageReason ||
                  k.killerDamageReason ||
                  "";
                  
                const rawDist =
                  k.killerDamageInfo?.distance ??
                  k.finisherDamageInfo?.distance ??
                  k.distance ??
                  0;

                const attacker = k.killer || k.attacker;
                return {
                  type: "킬",
                  attackerName: attacker?.name || "알 수 없음",
                  weapon: getWeaponName(weaponId),
                  weaponRaw: weaponId,
                  distanceM: Math.round(rawDist / 100), // cm → m
                  isHeadshot: reason === "HeadShot" || reason === "ArmShot",
                  reason: reason || "일반",
                  victimName: k.victim?.name || "Unknown",
                  time: k._D, // 이벤트 발생 시간
                  teammateDistances: k.victim?.location ? getTeammateDistances(k.victim.name, k._D, k.victim.location.x, k.victim.location.y) : {}
                };
              });

            // 기절 이벤트
            dbnoDetails = telData
              .filter((e: any) => {
                if (e._T !== "LogPlayerMakeDBNO") return false;
                const attacker = e.attacker;
                if (!attacker) return false;
                return teamNames.has(attacker.name?.toLowerCase()) || teamAccountIds.has(attacker.accountId);
              })
              .map((k: any) => {
                const weaponId =
                  k.killerDamageInfo?.damageCauserName ||
                  k.finisherDamageInfo?.damageCauserName ||
                  k.damageCauserName ||
                  k.killerDamageCauserName ||
                  "알 수 없음";

                const rawDist =
                  k.killerDamageInfo?.distance ??
                  k.finisherDamageInfo?.distance ??
                  k.distance ??
                  0;

                return {
                  type: "기절",
                  attackerName: k.attacker?.name || "알 수 없음",
                  weapon: getWeaponName(weaponId),
                  weaponRaw: weaponId,
                  distanceM: Math.round(rawDist / 100),
                  victimName: k.victim?.name || "Unknown",
                  time: k._D,
                  teammateDistances: k.victim?.location ? getTeammateDistances(k.victim.name, k._D, k.victim.location.x, k.victim.location.y) : {}
                };
              });

            // 아이템 사용 로그 (투척물 위주)
            const throwableIds = ["Item_Weapon_SmokeBomb_C", "Item_Weapon_Grenade_C", "Item_Weapon_Molotov_C", "Item_Weapon_FlashBang_C"];
            itemUseDetails = telData
              .filter((e: any) => {
                if (e._T !== "LogItemUse") return false;
                if (!throwableIds.includes(e.item?.itemId)) return false;
                return teamNames.has(e.character?.name?.toLowerCase());
              })
              .map((e: any) => ({
                playerName: e.character?.name,
                itemId: e.item?.itemId,
                itemName: getWeaponName(e.item?.itemId),
                time: e._D
              }));

            // 데미지 로그 (백업 분석용)
            damageDetails = telData
              .filter((e: any) => {
                if (e._T !== "LogPlayerTakeDamage") return false;
                const attacker = e.attacker;
                const victim = e.victim;
                if (!attacker || !victim) return false;
                
                // 팀원이 때렸거나 맞았을 때
                const isTeamAttacker = teamNames.has(attacker.name?.toLowerCase());
                const isTeamVictim = teamNames.has(victim.name?.toLowerCase());
                
                // 자기장 데미지 분석 (3페이즈/약 12분 기준 분리)
                if (isTeamVictim && e.damageTypeCategory === "Damage_BlueZone") {
                  if (matchStartTime) {
                    const elapsedMs = new Date(e._D).getTime() - matchStartTime;
                    if (elapsedMs >= 720000) { // 12분(3단계 시작점) 이후
                      lateBluezoneDamage += (e.damage || 0);
                    } else {
                      earlyBluezoneDamage += (e.damage || 0);
                    }
                  } else {
                    lateBluezoneDamage += (e.damage || 0);
                  }
                }

                return isTeamAttacker || isTeamVictim;
              })
              .map((e: any) => ({
                attackerName: e.attacker?.name,
                victimName: e.victim?.name,
                damage: e.damage,
                weapon: getWeaponName(e.damageCauserName),
                time: e._D
              }))
              .slice(-50); // 최근 교전 위주로 50개만 제한 (토큰 절약)

            // 차량 탑승 로그
            vehicleDetails = telData
              .filter((e: any) => e._T === "LogVehicleRide" && teamNames.has(e.character?.name?.toLowerCase()))
              .map((e: any) => ({
                playerName: e.character?.name,
                vehicleId: e.vehicle?.vId,
                time: e._D
              }));
          }
        }
      }
    } catch (telErr) {
      // 텔레메트리 실패 시 기본 stats 데이터로만 분석 (non-blocking)
      console.warn("[MATCH] 텔레메트리 조회 실패 (기본 데이터로 폴백):", telErr);
    }

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
    
    const mappedStats = {
      ...myInfo.attributes.stats,
      deathType: deathTypeMap[myInfo.attributes.stats.deathType] || myInfo.attributes.stats.deathType,
    };

    return NextResponse.json({
      matchId,
      mapName,
      createdAt,
      gameMode: matchAttr.gameMode,
      stats: mappedStats,
      team: teamStats, // 팀원들 전체 기록
      totalTeamKills, // 팀 총 킬
      totalTeamDamage, // 팀 총 데미지
      killDetails,   // 텔레메트리 기반 킬 상세 (무기, 거리, 헤드샷)
      dbnoDetails,   // 텔레메트리 기반 기절 상세
      itemUseDetails, // 아이템 사용 상세 (투척물 등)
      vehicleDetails, // 차량 이용 상세
      damageDetails,  // 데미지 상세 (백업 분석용)
      earlyBluezoneDamage, // 초반 자기장 피해
      lateBluezoneDamage,  // 3페이즈 이후 자기장 피해
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
