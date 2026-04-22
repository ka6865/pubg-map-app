// 파일 위치: app/api/pubg/match/route.ts
import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";

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
  const nickname = searchParams.get("nickname") || "";
  const platform = searchParams.get("platform") || "steam";

  const normalizeName = (n: string) => n?.toLowerCase().trim() || "";
  const lowerNickname = normalizeName(nickname);

  if (!matchId || !nickname)
    return NextResponse.json({ error: "파라미터가 부족합니다." }, { status: 400 });

  // [STEP 0] 통합 캐시(Full Result) 최우선 체크
  try {
    // [STEP 0] 캐시 체크는 플레이어 식별 후 진행 (아래로 이동)
  } catch {
    // 캐시가 없거나 에러 시 계속 진행
  }
  // 환경 변수에서 불필요한 공백 및 텍스트(예: "Rate Limit 10 RPM...")를 제거하고 진짜 토큰만 추출
  const apiKey = (process.env.PUBG_API_KEY || "").split(" ")[0];
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/vnd.api+json",
  };

  try {
    const res = await fetch(
      `https://api.pubg.com/shards/${platform}/matches/${matchId}`,
      { headers, cache: "no-store" } as RequestInit
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
    const myInfo = participants.find(
      (p: any) => p.attributes.stats.name?.toLowerCase() === lowerNickname
    );
    if (!myInfo) throw new Error("플레이어 데이터를 찾을 수 없습니다.");

    const accountId: string = myInfo.attributes.stats.playerId;

    // [STEP 0-A] 통합 캐시(Full Result) 체크 (플레이어 식별 후)
    try {
      const { data: fullCache } = await supabase
        .from("processed_match_telemetry")
        .select("data")
        .eq("match_id", matchId)
        .eq("player_id", lowerNickname)
        .single();

      if (fullCache && (fullCache.data as any).fullResult) {
        const cached = (fullCache.data as any).fullResult;
        if (cached.myRank && cached.combatPressure && cached.v >= 13) {
          console.log(`[MATCH] V13 Cache Hit: ${matchId} for ${lowerNickname}`);
          return NextResponse.json(cached);
        }
        console.log(`[MATCH] Outdated Cache (v < 13) for ${lowerNickname}, Re-calculating...`);
      }
    } catch { /* 캐시 없음 */ }

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

    // 5. [V3] 정규 참가자(Meaningful Participants) 필터링 및 통계
    const meaningfulParticipants = participants.filter((p: any) => {
      const s = p.attributes.stats;
      return s.damageDealt > 0 || s.timeSurvived > 60;
    });

    const matchStats = {
      avgDamage: Math.round(meaningfulParticipants.reduce((acc: number, p: any) => acc + p.attributes.stats.damageDealt, 0) / meaningfulParticipants.length),
      avgKills: Number((meaningfulParticipants.reduce((acc: number, p: any) => acc + p.attributes.stats.kills, 0) / meaningfulParticipants.length).toFixed(2)),
      totalParticipants: meaningfulParticipants.length
    };

    // [V13] 매치 내 딜량 상위 10명(Top 10 Players) 개인 퍼포먼스 기준치 추출
    const top10Players = [...meaningfulParticipants].sort((a: any, b: any) => b.attributes.stats.damageDealt - a.attributes.stats.damageDealt).slice(0, 10);
    const top10Baseline = {
      avgDamage: top10Players.length > 0 ? Math.round(top10Players.reduce((acc: number, p: any) => acc + p.attributes.stats.damageDealt, 0) / top10Players.length) : 0,
      avgKills: top10Players.length > 0 ? Number((top10Players.reduce((acc: number, p: any) => acc + p.attributes.stats.kills, 0) / top10Players.length).toFixed(1)) : 0,
      headshotRate: (() => {
        const totalKills = top10Players.reduce((acc: number, p: any) => acc + p.attributes.stats.kills, 0);
        const totalHS = top10Players.reduce((acc: number, p: any) => acc + p.attributes.stats.headshotKills, 0);
        return totalKills > 0 ? Math.round((totalHS / totalKills) * 100) : 0;
      })()
    };

    // 내 백분위 및 순위 계산 (딜량 & 킬 기준)
    const sortedDamage = [...meaningfulParticipants].sort((a: any, b: any) => b.attributes.stats.damageDealt - a.attributes.stats.damageDealt);
    const myDamageRankRaw = sortedDamage.findIndex((p: any) => p.attributes.stats.playerId === accountId);
    const myDamageRank = myDamageRankRaw === -1 ? meaningfulParticipants.length + 1 : myDamageRankRaw + 1;
    const myDamagePercentile = Math.round(((meaningfulParticipants.length - myDamageRank) / (meaningfulParticipants.length || 1)) * 100);

    const sortedKills = [...meaningfulParticipants].sort((a: any, b: any) => b.attributes.stats.kills - a.attributes.stats.kills);
    const myKillRankRaw = sortedKills.findIndex((p: any) => p.attributes.stats.playerId === accountId);
    const myKillRank = myKillRankRaw === -1 ? meaningfulParticipants.length + 1 : myKillRankRaw + 1;

    const totalTeamKills = teamStats.reduce((sum: number, member: any) => sum + member.kills, 0);
    const totalTeamDamage = teamStats.reduce((sum: number, member: any) => sum + member.damageDealt, 0);

    // 6. 텔레메트리 데이터 수집 및 캐싱 로직 시작
    const combatPressure = {
      totalHits: 0,
      uniqueVictims: new Set<string>(),
      maxHitDistance: 0,
      utilityDamage: 0,
      utilityHits: 0
    };
    const playerPositions: Record<string, { ts: number, x: number, y: number }[]> = {};
    let telData: any[] = [];

    let killDetails: any[] = [];
    let dbnoDetails: any[] = [];
    let itemUseDetails: any[] = [];
    let reviveDetails: any[] = [];
    let vehicleDetails: any[] = [];
    let damageDetails: any[] = [];
    let teammateDistancesAtDeath: any = {};
    let myEarlyBluezoneDamage = 0;
    let myLateBluezoneDamage = 0;
    let teamEarlyBluezoneDamage = 0;
    let teamLateBluezoneDamage = 0;
    let matchStartTime: number | null = null;

    // 이 위치의 선언 제거 (최상단으로 이동됨)

    const teamNames = new Set(teamStats.map((m: any) => normalizeName(m.name)));
    const teamAccountIds = new Set(teamStats.map((m: any) => m.playerId));

    try {
      console.log(`[MATCH] Team mapping initialized: ${Array.from(teamNames).join(", ")} (${teamNames.size} members)`);

      const telemetryAsset = data.included?.find(
        (inc: any) =>
          inc.type === "asset" &&
          (inc.attributes?.name === "telemetry" || inc.attributes?.URL?.toLowerCase().includes("telemetry"))
      );
      const telemetryUrl = telemetryAsset?.attributes?.URL;

      if (telemetryUrl) {
        // [STEP 1] 플레이어별 분석 결과(Full Result) 최우선 체크
        const { data: cachedPlayerResult } = await supabase
          .from("processed_match_telemetry")
          .select("data")
          .eq("match_id", matchId)
          .eq("player_id", lowerNickname)
          .single();

        if (cachedPlayerResult && (cachedPlayerResult.data as any).fullResult) {
          const cached = (cachedPlayerResult.data as any).fullResult;
          if (cached.v >= 13) {
            console.log(`[MATCH] Player Cache Hit (v13): ${matchId} for ${lowerNickname}`);
            return NextResponse.json(cached);
          }
        }

        // [STEP 2] 공용 매치 데이터(Master Telemetry) 체크
        const { data: cachedMaster } = await supabase
          .from("match_master_telemetry")
          .select("telemetry_events, created_at")
          .eq("match_id", matchId)
          .single();

        if (cachedMaster) {
          const masterEvents = (cachedMaster.telemetry_events as any) || [];
          // [V8] 아이템 사용(ItemUse) 및 공격자 위치(location)가 포함된 최신 마스터 캐시인지 확인
          const hasTacticalData = masterEvents.some((e: any) => e._T === "LogItemUse" || e._T === "LogPlayerRevive" || e._T === "LogHeal");
          const sampleDamage = masterEvents.find((e: any) => e._T === "LogPlayerTakeDamage" && e.attacker);
          const isV8Master = sampleDamage ? !!sampleDamage.attacker.location : true;
          
          if (hasTacticalData && isV8Master) {
            console.log(`[MATCH] Valid Master Cache Hit (v8): ${matchId}`);
            telData = masterEvents;
            const startEvent = telData.find(e => e._T === "LogMatchStart");
            matchStartTime = startEvent ? new Date(startEvent._D).getTime() : null;
          } else {
            console.log(`[MATCH] Outdated Master Cache (No location data): ${matchId}. Forcing re-download...`);
          }
        }

        if (!telData || telData.length === 0) {
          console.log(`[MATCH] Cache Miss: ${matchId}. Downloading from PUBG...`);
          const telRes = await fetch(telemetryUrl, {
            headers: { "Accept-Encoding": "gzip, deflate" },
            cache: 'no-store',
          });

          if (telRes.ok) {
            const arrayBuffer = await telRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            let telDataStr = "";
            if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
              const zlib = await import("node:zlib");
              telDataStr = zlib.gunzipSync(buffer).toString("utf-8");
            } else {
              telDataStr = buffer.toString("utf-8");
            }

            const rawEvents: any[] = JSON.parse(telDataStr);
            // [ULTRA-LITE] 가변 샘플링 및 핵심 이벤트 필터링
            const lastSavedPos: Record<string, number> = {};
            const lastCombatTime: Record<string, number> = {};
            let tempStartTime = 0;
            const filtered: any[] = [];

            // 1차 패스: 전투 시간 기록
            for (const e of rawEvents) {
              if (["LogPlayerTakeDamage", "LogPlayerAttack", "LogPlayerKill", "LogPlayerMakeDBNO"].includes(e._T)) {
                const ts = new Date(e._D).getTime();
                const p1 = e.attacker?.name || e.victim?.name || e.character?.name;
                const p2 = e.victim?.name || e.attacker?.name;
                if (p1) lastCombatTime[p1] = ts;
                if (p2) lastCombatTime[p2] = ts;
              }
            }

            // 2차 패스: 필터링 및 샘플링
            for (const e of rawEvents) {
              const ts = new Date(e._D).getTime();
              if (e._T === "LogMatchStart") tempStartTime = ts;
              
               const important = [
                "LogMatchStart", "LogPlayerKill", "LogPlayerKillV2", 
                "LogPlayerMakeDBNO", "LogItemUse", "LogVehicleRide", 
                "LogPlayerPosition", "LogPlayerTakeDamage", "LogPlayerRevive",
                "LogHeal", "LogPlayerAttack"
              ].includes(e._T);
              
              if (!important) continue;

              // 위치 정보 가변 샘플링 (전투 중 10초, 비전투 30초)
              if (e._T === "LogPlayerPosition") {
                if (!e.character) continue;
                const name = e.character.name;
                const isCombat = lastCombatTime[name] && (Math.abs(ts - lastCombatTime[name]) < 30000);
                const interval = isCombat ? 10000 : 30000;

                if (lastSavedPos[name] && ts - lastSavedPos[name] < interval) continue;
                lastSavedPos[name] = ts;
              }

              // [LIGHT-WEIGHT] 불필요 필드 제거 (용량 최적화 핵심)
              if (e._T === "LogItemUse" || e._T === "LogHeal") {
                const itemId = e.item?.itemId || e.healItemId || "";
                const isImportant = itemId.includes("SmokeBomb") || itemId.includes("Grenade") || 
                                   itemId.includes("Molotov") || itemId.includes("FlashBang") ||
                                   itemId.includes("MedKit") || itemId.includes("FirstAid") || 
                                   itemId.includes("Bandage") || itemId.includes("PainKiller") || 
                                   itemId.includes("EnergyDrink") || itemId.includes("Adrenaline");
                if (!isImportant) continue;
              }
              if (e._T === "LogPlayerAttack") {
                const weaponId = e.weapon?.itemId || "";
                const isThrowable = weaponId.includes("SmokeBomb") || weaponId.includes("Grenade") || 
                                   weaponId.includes("Molotov") || weaponId.includes("FlashBang") || weaponId.includes("C4");
                if (!isThrowable) continue;
              }

              const leanEvent = { ...e, _TS: ts };
              delete leanEvent.common; // 공통 메타데이터 제거
              
              if (leanEvent.character) {
                const baseChar = { name: leanEvent.character.name, teamId: leanEvent.character.teamId };
                // LogPlayerPosition인 경우에만 위치 정보(location) 유지
                if (e._T === "LogPlayerPosition" && e.character.location) {
                  leanEvent.character = { ...baseChar, location: e.character.location };
                } else {
                  leanEvent.character = baseChar;
                }
              }
              if (leanEvent.attacker) {
                leanEvent.attacker = { 
                  name: leanEvent.attacker.name, 
                  teamId: leanEvent.attacker.teamId, 
                  ...(e.attacker.location && { location: e.attacker.location }) 
                };
              }
              if (leanEvent.victim) {
                leanEvent.victim = { 
                  name: leanEvent.victim.name, 
                  teamId: leanEvent.victim.teamId,
                  ...(e.victim.location && { location: e.victim.location })
                };
              }

              filtered.push(leanEvent);
            }

            telData = filtered;
            matchStartTime = tempStartTime;

            // [SAVE MASTER] 공용 데이터 저장 (경기당 1번) - Fire and Forget (타임아웃 지연 방지)
            supabase.from("match_master_telemetry").upsert({
              match_id: matchId,
              map_name: matchAttr.mapName,
              game_mode: matchAttr.gameMode,
              telemetry_events: telData
            }).then(({ error }) => {
              if (error) {
                console.error(`[MATCH] Master Cache Save Failed: ${matchId}`, error);
              } else {
                console.log(`[MATCH] Master Cache Saved: ${matchId}`);
              }
            });
          }
        }
      }

      // [STEP 3] 추출/캐시된 공용 데이터를 바탕으로 플레이어별 지표 분석 (재계산)
      if (Array.isArray(telData) && telData.length > 0) {
        const blueSum = { myE: 0, myL: 0, teamE: 0, teamL: 0 };
        const teamNamesLower = new Set(teamStats.map((m: any) => normalizeName(m.name)));
        const teamAccountIds = new Set(teamStats.map((m: any) => m.playerId));

        telData.forEach((e: any) => {
          const ts = e._TS;
          const char = e.character || e.victim || e.attacker;
          if (!char) return;

          const name = normalizeName(char.name);
          const isMe = name === lowerNickname;
          const isTeam = teamNamesLower.has(name);

          // 1. 자기장 피해량 계산
          if (e._T === "LogPlayerTakeDamage" && (e.damageTypeCategory === "Damage_BlueZone" || e.damageTypeCategory === "Damage_OutsidePlayZone")) {
            if (isTeam) {
              const isLate = matchStartTime && ts - matchStartTime >= 720000;
              if (isLate) blueSum.teamL += (e.damage || 0);
              else blueSum.teamE += (e.damage || 0);
              
              if (isMe) {
                if (isLate) blueSum.myL += (e.damage || 0);
                else blueSum.myE += (e.damage || 0);
              }
            }
          }

          // 2. 교전 압박 및 유틸리티 피해 분석
          if (e._T === "LogPlayerTakeDamage" && e.attacker && normalizeName(e.attacker.name) === lowerNickname) {
            if (e.victim && normalizeName(e.victim.name) !== lowerNickname) {
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

          // 3. 위치 정보 수집 (팀원 전체 동선 확보)
          if (char.location && isTeam) {
            if (!playerPositions[name]) playerPositions[name] = [];
            playerPositions[name].push({ ts, x: char.location.x, y: char.location.y });
          }
        });

        // 요약 값 업데이트
        myEarlyBluezoneDamage = blueSum.myE;
        myLateBluezoneDamage = blueSum.myL;
        teamEarlyBluezoneDamage = blueSum.teamE;
        teamLateBluezoneDamage = blueSum.teamL;

        const getTeammateDistances = (targetName: string, eventTs: number, sourceX: number, sourceY: number) => {
          const distances: Record<string, number> = {};
          const targetLower = normalizeName(targetName);
          
          Object.entries(playerPositions).forEach(([name, positions]) => {
            if (name === targetLower) return;
            if (!positions || positions.length === 0) return;

            let closestPos = positions[0];
            let minDiff = Infinity;
            
            for (const p of positions) {
              const diff = Math.abs(p.ts - eventTs);
              if (diff < minDiff) {
                minDiff = diff;
                closestPos = p;
              }
              if (diff < 1000) break; // 1초 이내면 충분히 신뢰 가능
            }
            
            if (closestPos) {
              const dx = sourceX - closestPos.x;
              const dy = sourceY - closestPos.y;
              const distM = Math.sqrt(dx * dx + dy * dy) / 100;
              distances[name] = Math.round(distM);
            }
          });
          if (Object.keys(distances).length === 0) {
            console.warn(`[MATCH] No teammate positions found for ${targetName} at ${eventTs}. Player pool: ${Object.keys(playerPositions).join(", ")}`);
          }
          return distances;
        };

        killDetails = telData.filter((e: any) => (e._T === "LogPlayerKill" || e._T === "LogPlayerKillV2"))
          .filter((e: any) => {
            const attacker = e.killer || e.attacker; const victim = e.victim;
            return (attacker && (teamNames.has(normalizeName(attacker.name)) || teamAccountIds.has(attacker.accountId))) ||
                   (victim && (teamNames.has(normalizeName(victim.name)) || teamAccountIds.has(victim.accountId)));
          })
          .map((k: any) => {
            const weaponId = k.killerDamageInfo?.damageCauserName || k.damageCauserName || "알 수 없음";
            const attacker = k.killer || k.attacker;
            const isHeadshot = k.damageReason === "HeadShot" || k.killerDamageInfo?.damageReason === "HeadShot";
            
            // 만약 죽은 사람이 나(nickname)라면, 당시 팀원과의 거리를 저장
            if (normalizeName(k.victim?.name) === lowerNickname && k.victim?.location) {
              teammateDistancesAtDeath = getTeammateDistances(k.victim.name, (k as any)._TS, k.victim.location.x, k.victim.location.y);
            }

            return {
              type: "킬", attackerName: attacker?.name || "알 수 없음", weapon: getWeaponName(weaponId),
              isHeadshot,
              distanceM: Math.round((k.killerDamageInfo?.distance || 0) / 100), victimName: k.victim?.name || "Unknown", time: k._D,
              teammateDistances: k.victim?.location ? getTeammateDistances(k.victim.name, (k as any)._TS, k.victim.location.x, k.victim.location.y) : {}
            };
          });

        dbnoDetails = telData.filter((e: any) => e._T === "LogPlayerMakeDBNO")
          .filter((e: any) => e.maker && (teamNames.has(normalizeName(e.maker.name)) || teamAccountIds.has(e.maker.accountId)))
          .map((k: any) => ({
            type: "기절", attackerName: k.maker?.name || "알 수 없음", weapon: getWeaponName(k.damageCauserName),
            isHeadshot: k.damageReason === "HeadShot",
            distanceM: Math.round((k.distance || 0) / 100), victimName: k.victim?.name || "Unknown", time: k._D,
            teammateDistances: k.victim?.location ? getTeammateDistances(k.victim.name, (k as any)._TS, k.victim.location.x, k.victim.location.y) : {}
          }));

        itemUseDetails = telData.filter((e: any) => 
          ((e._T === "LogItemUse" || e._T === "LogHeal") && teamNames.has(normalizeName(e.character?.name))) ||
          (e._T === "LogPlayerAttack" && e.weapon?.itemId && ["SmokeBomb", "Grenade", "Molotov", "FlashBang", "C4"].some(t => e.weapon.itemId.includes(t)) && teamNames.has(normalizeName(e.attacker?.name)))
        ).map((e: any) => ({ 
            playerName: e.character?.name || e.attacker?.name, 
            itemName: getWeaponName(e.item?.itemId || e.healItemId || e.weapon?.itemId), 
            itemId: e.item?.itemId || e.healItemId || e.weapon?.itemId, 
            time: e._D 
        }));

        reviveDetails = telData.filter((e: any) => e._T === "LogPlayerRevive" && teamNames.has(normalizeName(e.reviver?.name)))
          .map((e: any) => ({ reviverName: e.reviver?.name, victimName: e.victim?.name, time: e._D }));

        damageDetails = telData.filter((e: any) => e._T === "LogPlayerTakeDamage" && e.attacker && e.victim && (teamNames.has(normalizeName(e.attacker.name)) || teamNames.has(normalizeName(e.victim.name))))
          .map((e: any) => ({
            attackerName: e.attacker?.name, 
            victimName: e.victim?.name, 
            damage: e.damage, 
            weapon: getWeaponName(e.damageCauserName), 
            time: e._D 
          })).slice(-50);

        vehicleDetails = telData.filter((e: any) => e._T === "LogVehicleRide" && teamNames.has(normalizeName(e.character?.name)))
          .map((e: any) => ({ playerName: e.character?.name, vehicleId: e.vehicle?.vId, time: e._D }));
      }
    } catch (telErr) {
      console.warn("[MATCH] 텔레메트리 에러:", telErr);
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

    const finalResult = {
      matchId,
      mapName,
      createdAt,
      gameMode: matchAttr.gameMode,
      stats: mappedStats,
      team: teamStats,
      totalTeamKills,
      totalTeamDamage,
      killDetails,
      dbnoDetails,
      itemUseDetails,
      reviveDetails,
      vehicleDetails,
      damageDetails,
      myEarlyBluezoneDamage,
      myLateBluezoneDamage,
      teamEarlyBluezoneDamage,
      teamLateBluezoneDamage,
      matchStartTime,
      // [V3] 추가 지표
      matchStats,
      top10Baseline,
      myRank: {
        damageRank: myDamageRank,
        damagePercentile: myDamagePercentile,
        killRank: myKillRank
      },
      combatPressure: {
        totalHits: combatPressure.totalHits,
        uniqueVictims: Array.from(combatPressure.uniqueVictims),
        maxHitDistance: combatPressure.maxHitDistance,
        utilityDamage: Math.round(combatPressure.utilityDamage),
        utilityHits: combatPressure.utilityHits
      },
      totalDamageTaken: damageDetails.filter((d: any) => normalizeName(d.victimName) === lowerNickname).reduce((acc: number, d: any) => acc + d.damage, 0),
      totalDbnos: dbnoDetails.filter((d: any) => normalizeName(d.attackerName) === lowerNickname).length,
      teamDbnoVictimCount: telData.filter((e: any) => e._T === "LogPlayerMakeDBNO" && e.victim && (teamNames.has(normalizeName(e.victim.name)) || teamAccountIds.has(e.victim.accountId))).length,
      teammateDistancesAtDeath,
      processedAt: new Date().toISOString(),
      v: 13 // 캐시 버전 관리용 태그
    };

    // [STEP 7] 최종 결과 전체 캐싱 (player_id 별로 독립 저장)
    try {
      // 기존 텔레메트리 데이터가 있을 수 있으므로 병합하여 저장 (해당 플레이어용)
      const { data: currentCache } = await supabase
        .from("processed_match_telemetry")
        .select("data")
        .eq("match_id", matchId)
        .eq("player_id", lowerNickname)
        .single();
        
      const existingData = currentCache?.data || {};
      
      await supabase.from("processed_match_telemetry").upsert({
        match_id: matchId,
        player_id: lowerNickname, // 정규화된 닉네임 사용 (캐시 일관성)
        data: { 
          ...existingData,
          fullResult: finalResult 
        }
      }, { onConflict: "match_id,player_id" }); // 매치와 플레이어 조합으로 충돌 체크
      console.log(`[MATCH] Full Result Cached: ${matchId} for ${lowerNickname}`);
    } catch (_e) {
      console.warn("[MATCH] 최종 캐시 저장 실패:", _e);
    }

    return NextResponse.json(finalResult);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
