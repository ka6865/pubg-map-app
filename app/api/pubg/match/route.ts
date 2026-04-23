import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";

export const maxDuration = 60;

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
  NoName_Main: "훈련장",
};

const OFFICIAL_MAPS = new Set(Object.keys(MAP_NAMES));
const isEventMap = (mapName: string): boolean => {
  if (OFFICIAL_MAPS.has(mapName)) return false;
  if (/_Main_.+/.test(mapName)) return true;
  return true;
};

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
  "WeapMolotov_C": "화염병", "ProjMolotov_C": "화염병", "Item_Weapon_FlashBang_C": "섬광탄",
  "Item_Weapon_C4_C": "C4", "Thompson": "토미건", "WeapHK416_C": "M416",
};

const getWeaponName = (id: string): string => {
  if (!id || id === "None" || id === "null") return "알 수 없음";
  if (WEAPON_MAP[id]) return WEAPON_MAP[id];
  const lowerId = id.toLowerCase();
  if (lowerId.includes("brdm") || lowerId.includes("uaz") || lowerId.includes("dacia") || 
      lowerId.includes("buggy") || lowerId.includes("motorcycle") || lowerId.includes("pony") ||
      lowerId.includes("pico") || lowerId.includes("blanc") || lowerId.includes("mirado")) return "차량 (로드킬)";
  if (lowerId.includes("panzerfaust")) return "판저파우스트";
  if (lowerId.includes("punch") || lowerId.includes("melee")) return "주먹결투";
  if (lowerId.includes("pan") || lowerId.includes("machete") || lowerId.includes("sickle")) return "근접 무기";
  if (id.startsWith("Damage_")) {
    const m: Record<string, string> = {
      Damage_BlueZone: "자기장", Damage_RedZone: "폭격", Damage_Fall: "낙하", Damage_Drowning: "익사",
      Damage_OutsidePlayZone: "자기장", Damage_VehicleHit: "차량 (로드킬)", Damage_VehicleCrash: "차량 추돌", Damage_Fire: "화염병",
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

  if (!matchId || !nickname) return NextResponse.json({ error: "파라미터 부족" }, { status: 400 });

  const apiKey = (process.env.PUBG_API_KEY || "").split(" ")[0];
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/vnd.api+json" };

  try {
    const res = await fetch(`https://api.pubg.com/shards/${platform}/matches/${matchId}`, { headers, cache: "no-store" });
    if (!res.ok) throw new Error("매치 정보 로드 실패");
    const data = await res.json();
    const matchAttr = data.data.attributes;

    if (isEventMap(matchAttr.mapName)) return NextResponse.json({ isEventMode: true, mapRaw: matchAttr.mapName });

    const participants = data.included.filter((item: any) => item.type === "participant");
    const rosters = data.included.filter((item: any) => item.type === "roster");
    const myInfo = participants.find((p: any) => normalizeName(p.attributes.stats.name) === lowerNickname);
    if (!myInfo) throw new Error("플레이어 미발견");

    const accountId = myInfo.attributes.stats.playerId;

    // [DB] V37 개인 캐시 체크 (신규 필드 포함 여부 확인)
    try {
      const { data: fullCache } = await supabase.from("processed_match_telemetry").select("data").eq("match_id", matchId).eq("player_id", lowerNickname).single();
      if (fullCache && (fullCache.data as any).fullResult?.v >= 2.0) {
        console.log(`[DB] 2.0 Player Cache Hit: ${matchId} for ${lowerNickname}`);
        return NextResponse.json((fullCache.data as any).fullResult);
      }
    } catch {}

    const myRoster = rosters.find((r: any) => r.relationships.participants.data.some((p: any) => p.id === myInfo.id));
    const teamStats = myRoster ? myRoster.relationships.participants.data.map((pRef: any) => participants.find((p: any) => p.id === pRef.id)?.attributes.stats).filter(Boolean) : [myInfo.attributes.stats];
    const teamNames = new Set<string>();
    const teammateAccountIds = new Set<string>();
    teamStats.forEach((m: any) => {
        teamNames.add(normalizeName(m.name));
        teammateAccountIds.add(m.playerId);
    });
    console.log(`[DEBUG-V45] Team Members:`, Array.from(teamNames));

    // [STEP 1] 벤치마크 지표 산출
    const meaningfulParticipants = participants.filter((p: any) => p.attributes.stats.damageDealt > 0 || p.attributes.stats.timeSurvived > 60);
    const sortedDamage = [...meaningfulParticipants].sort((a, b) => b.attributes.stats.damageDealt - a.attributes.stats.damageDealt);
    const myDamageRank = sortedDamage.findIndex((p: any) => p.attributes.stats.playerId === accountId) + 1;
    const myDamagePercentile = Math.round(((meaningfulParticipants.length - myDamageRank) / meaningfulParticipants.length) * 100);
    
    const top15Players = sortedDamage.slice(0, 15);
    
    // [V40] 실시간 매치 벤치마크 (실제 상위 15인 평균)
    const realTop15AvgDamage = top15Players.length > 0 
      ? Math.round(top15Players.reduce((acc: number, p: any) => acc + (p.attributes?.stats?.damageDealt || 0), 0) / top15Players.length)
      : 250;
    const realTop15AvgKills = top15Players.length > 0
      ? Number((top15Players.reduce((acc: number, p: any) => acc + (p.attributes?.stats?.kills || 0), 0) / top15Players.length).toFixed(1))
      : 2.5;
    // [킬 순위 계산]
    const sortedKills = [...meaningfulParticipants].sort((a, b) => {
      if (b.attributes.stats.kills !== a.attributes.stats.kills) {
        return b.attributes.stats.kills - a.attributes.stats.kills;
      }
      return b.attributes.stats.damageDealt - a.attributes.stats.damageDealt;
    });
    const myKillRank = sortedKills.findIndex((p: any) => p.attributes.stats.playerId === accountId) + 1;

    // [STEP 2] 텔레메트리 다운로드 및 분석 (Master Cache 적용)
    let telData: any[] = [];
    try {
      const { data: masterCache } = await supabase.from("match_master_telemetry").select("telemetry_events").eq("match_id", matchId).single();
      if (masterCache?.telemetry_events) {
        console.log(`[DB] Master Telemetry Hit! (Cache): ${matchId}`);
        telData = masterCache.telemetry_events as any[];
      }
    } catch {}

    if (telData.length === 0) {
      const telemetryAsset = data.included.find((inc: any) => inc.type === "asset" && inc.attributes?.URL?.includes("telemetry"));
      if (telemetryAsset?.attributes?.URL) {
        console.log(`[PUBG] Downloading Telemetry: ${matchId}`);
        const telRes = await fetch(telemetryAsset.attributes.URL);
        telData = await telRes.json();
        
        // [2.0] 데이터 다이어트 최적화 유지 (30,000건)
        const essentialEvents = telData.filter((e: any) => 
          ["LogMatchStart", "LogPlayerKill", "LogPlayerKillV2", "LogPlayerMakeDBNO", "LogPlayerTakeDamage", "LogItemUse"].includes(e._T)
        ).slice(0, 30000);

        supabase.from("match_master_telemetry").upsert({
          match_id: matchId, map_name: matchAttr.mapName, game_mode: matchAttr.gameMode,
          telemetry_events: essentialEvents
        }).then(({ error }) => {
          if (error) console.error(`[DB] Master Cache Save Failed: ${matchId}`, error);
          else console.log(`[DB] Master Telemetry (Filtered 2.0) Cached: ${matchId}`);
        });
      }
    }

    // [V37] 텔레메트리 시간순 정렬 (판정 정확도 향상)
    telData.sort((a, b) => new Date(a._D).getTime() - new Date(b._D).getTime());

    // [V37] 전역 전투 트래커 (상위 15인 실측용)
    const playerCombatData = new Map<string, { total: number; success: number; sessions: Map<string, any> }>();
    const top15Names = new Set(top15Players.map((p: any) => normalizeName(p.attributes.stats.name)));

    // [V37] 정밀 지표 변수
    const goldenTimeDamage = { early: 0, mid1: 0, mid2: 0, late: 0 };
    const killContribution = { solo: 0, cleanup: 0, other: 0 };
    const itemUseEvents: string[] = [];
    const teammateKnockEvents: any[] = [];
    const myDamageEvents: any[] = [];
    const myActionTimestamps: number[] = [];
    let bluezoneWasteCount = 0; 
    let lastBluezoneDamageTime = 0;
    let bluezoneDamageAccum = 0;

    const startEvent = telData.find(e => e._T === "LogMatchStart");
    const matchStartTime = startEvent ? new Date(startEvent._D).getTime() : 0;

    telData.forEach((e: any) => {
      const ts = new Date(e._D).getTime();
      const elapsed = (ts - matchStartTime) / 1000;

      // 1. 선제 타격 시도 감지 (User + Top15)
      if (e._T === "LogPlayerTakeDamage" && e.attacker && e.victim && normalizeName(e.attacker.name) !== normalizeName(e.victim.name)) {
        const attackerName = normalizeName(e.attacker.name);
        const victimName = normalizeName(e.victim.name);
        const attackerId = e.attacker.accountId;

        if (attackerName === lowerNickname || top15Names.has(attackerName)) {
          let pData = playerCombatData.get(attackerName);
          if (!pData) {
            pData = { total: 0, success: 0, sessions: new Map() };
            playerCombatData.set(attackerName, pData);
          }

          const session = pData.sessions.get(victimName);
          // [V39] 세션 만료 시간을 120초로 연장
          if (!session || ts - Math.max(session.lastHitByEnemy, session.lastHitByUser) > 120000) {
            pData.sessions.set(victimName, { 
              lastHitByEnemy: 0, 
              lastHitByUser: ts, 
              userStarted: true, 
              alreadySucceeded: false 
            });
            pData.total++;
          } else {
            session.lastHitByUser = ts;
            // 이미 내가 먼저 시작한 세션이라면, 적에게 맞더라도 userStarted 유지
          }
        }

        // 피해 수신 (시작 주도권 상실 체크)
        const victimNameNorm = normalizeName(e.victim.name);
        if (victimNameNorm === lowerNickname || top15Names.has(victimNameNorm)) {
          const pData = playerCombatData.get(victimNameNorm);
          if (pData) {
            const session = pData.sessions.get(attackerName);
            // [V39] 적에게 먼저 맞았을 때 세션 생성 (유효 기간 120초)
            if (!session || ts - Math.max(session.lastHitByEnemy, session.lastHitByUser) > 120000) {
              pData.sessions.set(attackerName, { lastHitByEnemy: ts, lastHitByUser: 0, userStarted: false, alreadySucceeded: false });
            } else {
              session.lastHitByEnemy = ts;
              // 내가 이미 쏜 적에게 나중에 맞는 것이라면 userStarted=true는 유지됨 (건드리지 않음)
            }
          }
        }
      }

      // 2. 성공 판정 (Knock, Kill or KillV2)
      if ((e._T === "LogPlayerKill" || e._T === "LogPlayerKillV2" || e._T === "LogPlayerMakeDBNO")) {
        // [V44] Kill/KillV2는 killer/attacker, DBNO는 maker/attacker 필드를 전수 체크
        const killer = e.killer || e.maker || e.attacker; 
        if (killer && e.victim) {
          const victimName = normalizeName(e.victim.name);
          
          // [V41] 아군 처치 제외 및 팀 단위 성공 판정
          if (!teamNames.has(victimName)) {
            // 이 희생자에게 교전을 '먼저 시작'했던 모든 우리 팀원에게 성공 부여
            teamNames.forEach((member: string) => {
              const memberData = playerCombatData.get(member);
              if (memberData) {
                const session = memberData.sessions.get(victimName);
                // 기절이든 킬이든 먼저 쏜 사람에게 성공 부여 (중복 방지: alreadySucceeded)
                if (session?.userStarted && !session.alreadySucceeded) {
                  memberData.success++;
                  session.alreadySucceeded = true;
                }
              }
            });
          }
        }
      }

      // 3. 유저 전용 추가 지표 수집
      // [V52] 데미지 및 아이템 사용 추적 (Attacker/Character 필드 통합 처리)
      if (e._T === "LogPlayerTakeDamage") {
        const attackerName = normalizeName(e.attacker?.name || e.character?.name || "");
        if (attackerName === lowerNickname && normalizeName(e.victim?.name) !== lowerNickname) {
          const dmg = e.damage || 0;
          if (elapsed <= 300) goldenTimeDamage.early += dmg;
          else if (elapsed <= 900) goldenTimeDamage.mid1 += dmg;
          else if (elapsed <= 1500) goldenTimeDamage.mid2 += dmg;
          else goldenTimeDamage.late += dmg;
          myDamageEvents.push({ ts, victim: e.victim?.name, dmg });
        }
      }

      if (e._T === "LogItemUse") {
        const charName = normalizeName(e.character?.name || "");
        if (charName === lowerNickname) {
          const itemId = e.item?.itemId || e.itemId || "";
          if (itemId) itemUseEvents.push(itemId);
        }
      }

      // [V37] 유저의 공격적 액션(기절/사망 유발) 기록
      if ((e._T === "LogPlayerKill" || e._T === "LogPlayerKillV2" || e._T === "LogPlayerMakeDBNO")) {
        const actor = e.killer || e.maker || e.attacker; 
        if (actor && normalizeName(actor.name) === lowerNickname) {
          myActionTimestamps.push(ts);
        }
      }
      
      // [V47] 3. 아군 기절/사망 감지 (Trade 분석 시작점)
      if ((e._T === "LogPlayerMakeDBNO" || e._T === "LogPlayerKill" || e._T === "LogPlayerKillV2") && e.victim) {
        const victimNameNorm = normalizeName(e.victim.name);
        const isTeammate = teamNames.has(victimNameNorm);
        
        // 디버깅: 모든 아군 관련 사망/기절 이벤트 출력
        if (isTeammate) {
          console.log(`[DEBUG-V47] Teammate Event: ${e._T} | Victim: ${e.victim.name} | isUser: ${victimNameNorm === lowerNickname}`);
        }

        if (isTeammate && victimNameNorm !== lowerNickname) {
          const alreadyTracked = teammateKnockEvents.some(tk => tk.victim === e.victim.name && ts - tk.ts < 10000);
          if (!alreadyTracked) {
            teammateKnockEvents.push({ ts, victim: e.victim.name, attacker: (e.attacker || e.killer || e.maker)?.name });
          }
        }
      }

      if (e._T === "LogPlayerTakeDamage" && normalizeName(e.victim?.name) === lowerNickname && (e.damageTypeCategory === "Damage_BlueZone" || e.damageTypeCategory === "Damage_OutsidePlayZone")) {
        lastBluezoneDamageTime = ts;
        bluezoneDamageAccum += (e.damage || 0);
      }

      if (e._T === "LogPlayerKill" && normalizeName(e.victim?.name) === lowerNickname) {
        if (bluezoneDamageAccum >= 30 && ts - lastBluezoneDamageTime < 30000) {
          bluezoneWasteCount++;
        }
      }
    });
    console.log(`[DEBUG-V47] Found ${teammateKnockEvents.length} teammate knock/death events.`);
    console.log(`[DEBUG-V47] Found ${myDamageEvents.length} user damage events.`);

    // [V31] 전술적 몰살(Team Wipe) 감지 로직 (Duo 대응)
    const teamSize = teamStats.length;
    const wipeThreshold = teamSize >= 4 ? 3 : teamSize;
    const teamDeaths = telData
      .filter(e => (e._T === "LogPlayerKill" || e._T === "LogPlayerKillV2") && teamNames.has(normalizeName(e.victim?.name)))
      .map(e => new Date(e._D).getTime())
      .sort((a, b) => a - b);
    
    let teamWipeOccurred = false;
    if (teamDeaths.length >= wipeThreshold) {
      const interval = (teamDeaths[teamDeaths.length - 1] - teamDeaths[0]) / 1000;
      const timeLimit = teamSize >= 4 ? 90 : 60;
      if (interval <= timeLimit && myInfo.attributes.stats.winPlace > 1) {
        teamWipeOccurred = true;
      }
    }

    const myKillEvents = telData.filter(e => (e._T === "LogPlayerKill" || e._T === "LogPlayerKillV2") && normalizeName(e.killer?.name || e.attacker?.name) === lowerNickname);
    // myActionTimestamps는 위 loop에서 이미 수집됨
    
    myKillEvents.forEach(k => {
      const victimName = k.victim?.name;
      if (!victimName) return;
      // [V37] 플레이어 간 피해만 포함 (환경 피해 제외)
      const victimDamage = telData.filter(e => 
        e._T === "LogPlayerTakeDamage" && 
        e.victim?.name === victimName &&
        e.attacker &&
        !["Damage_BlueZone", "Damage_RedZone", "Damage_Fall", "Damage_Drowning"].includes(e.damageTypeCategory)
      );
      const myTotalDmg = victimDamage.filter(e => normalizeName(e.attacker?.name) === lowerNickname).reduce((acc, e) => acc + (e.damage || 0), 0);
      const totalDmg = victimDamage.reduce((acc, e) => acc + (e.damage || 0), 0);
      if (myTotalDmg >= totalDmg * 0.7) killContribution.solo++;
      else if (myTotalDmg > 0) killContribution.cleanup++;
      else killContribution.other++;
    });

    let totalLatency = 0; let latencyCount = 0;
    teammateKnockEvents.forEach(tk => {
      const firstResponse = myDamageEvents.find(md => md.ts > tk.ts && md.ts < tk.ts + 30000);
      if (firstResponse) { totalLatency += (firstResponse.ts - tk.ts); latencyCount++; }
    });

    // [V37] 복수(Trade) 지표 집계 (DB 용량 최적화를 위해 집계값만 저장)
    const coverAttempts = teammateKnockEvents.filter((tk, idx) => {
      const damageToFoe = myDamageEvents.filter(md => md.ts > tk.ts && md.ts < tk.ts + 30000).reduce((acc, md) => acc + md.dmg, 0);
      const hasAction = myActionTimestamps.some(ats => ats > tk.ts && ats < tk.ts + 30000);
      console.log(`[DEBUG-2.0] Knock #${idx} at ${tk.ts} (Victim: ${tk.victim}, Attacker: ${tk.attacker}) -> DamageToFoe: ${damageToFoe}, HasAction: ${hasAction}`);
      return damageToFoe > 0 || hasAction;
    }).length;
    console.log(`[DEBUG-2.0] Final Cover Attempts: ${coverAttempts} / ${teammateKnockEvents.length}`);

    const tradeStats = {
      teammateKnocks: teammateKnockEvents.length,
      userCoverAttempts: coverAttempts,
      coverRate: teammateKnockEvents.length > 0 ? Math.round((coverAttempts / teammateKnockEvents.length) * 100) : 0,
      tradeLatencyMs: latencyCount > 0 ? totalLatency / latencyCount : 0
    };
    // detailedTeamwork raw 배열은 제거함

    // [V37] 최종 지표 산출
    const myCombatData = playerCombatData.get(lowerNickname) || { total: 0, success: 0 };
    const top15CombatRates = Array.from(playerCombatData.entries())
      .filter(([name, data]) => top15Names.has(name))
      .map(([name, data]) => (data.total > 0 ? (data.success / data.total) * 100 : 0))
      .filter(rate => rate > 0);

    const realTop15InitiativeAvg = top15CombatRates.length > 0 
      ? Math.round(top15CombatRates.reduce((a, b) => a + b, 0) / top15CombatRates.length)
      : 55; // 데이터 부족 시 기본값

    const top15Baseline = {
      avgDamage: realTop15AvgDamage, // [실측] 해당 매치 상위 15인 평균
      avgKills: realTop15AvgKills,   // [실측] 해당 매치 상위 15인 평균
      realTradeLatency: 1800,      // [표준] 상위권 권장 지표 (V49 현실화: 0.8s -> 1.8s)
      realInitiativeSuccess: 55,   // [표준] 상위권 권장 지표
      realDeathDistance: 30        // [표준] 상위권 권장 지표
    };

    const itemUseSummary = {
      smokes: itemUseEvents.filter(id => id.includes("SmokeBomb")).length,
      frags: itemUseEvents.filter(id => id.includes("Grenade") && !id.includes("Smoke")).length,
      heals: itemUseEvents.filter(id => id.includes("MedKit") || id.includes("FirstAid")).length,
      boosts: itemUseEvents.filter(id => id.includes("PainKiller") || id.includes("EnergyDrink")).length
    };

    const finalResult = {
      matchId, mapName: MAP_NAMES[matchAttr.mapName] || matchAttr.mapName, createdAt: matchAttr.createdAt, gameMode: matchAttr.gameMode,
      stats: myInfo.attributes.stats, team: teamStats, v: 2.0, top10Baseline: top15Baseline,
      tradeStats, // tradeStats 내부에 tradeLatencyMs 포함됨
      myRank: { 
        damageRank: myDamageRank, 
        damagePercentile: myDamagePercentile, 
        killRank: myKillRank,
        totalTeams: rosters.length,
        totalPlayers: participants.length
      },
      teamWipeOccurred,
      initiativeSuccessRate: myCombatData.total > 0 ? Math.round((myCombatData.success / myCombatData.total) * 100) : 0,
      initiativeStats: {
        total: myCombatData.total,
        success: myCombatData.success,
        rate: myCombatData.total > 0 ? Math.round((myCombatData.success / myCombatData.total) * 100) : 0
      },
      goldenTimeDamage, 
      killContribution, 
      tradeLatency: latencyCount > 0 ? totalLatency / latencyCount : 0,
      itemUseSummary, 
      bluezoneWasteCount, 
      survivalTimeSec: myInfo.attributes.stats.timeSurvived || 0,
      processedAt: new Date().toISOString()
    };

    // [V43] Supabase 캐시 저장 (Non-blocking: Fire-and-Forget)
    (supabase
      .from("processed_match_telemetry")
      .upsert({
        match_id: matchId,
        player_id: lowerNickname,
        data: { fullResult: finalResult },
        updated_at: new Date().toISOString()
      }, { onConflict: 'match_id,player_id' }) as any)
      .then(({ error: upsertError }: any) => {
        if (upsertError) console.error("[DB] Cache Upsert Error:", upsertError);
        else console.log(`[DB] User Analysis (2.0) Cached: ${matchId} for ${lowerNickname}`);
      })
      .catch((dbErr: any) => console.error("[DB] Critical Cache Error:", dbErr));

    return NextResponse.json(finalResult);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
