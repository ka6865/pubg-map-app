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

    // [DB] V30 개인 캐시 체크
    try {
      const { data: fullCache } = await supabase.from("processed_match_telemetry").select("data").eq("match_id", matchId).eq("player_id", lowerNickname).single();
      if (fullCache && (fullCache.data as any).fullResult?.v >= 30) {
        console.log(`[DB] V30 Player Cache Hit: ${matchId} for ${lowerNickname}`);
        return NextResponse.json((fullCache.data as any).fullResult);
      }
    } catch {}

    const myRoster = rosters.find((r: any) => r.relationships.participants.data.some((p: any) => p.id === myInfo.id));
    const teamStats = myRoster ? myRoster.relationships.participants.data.map((pRef: any) => participants.find((p: any) => p.id === pRef.id)?.attributes.stats).filter(Boolean) : [myInfo.attributes.stats];
    const teamNames = new Set(teamStats.map((m: any) => normalizeName(m.name)));

    // [STEP 1] 벤치마크 지표 산출
    const meaningfulParticipants = participants.filter((p: any) => p.attributes.stats.damageDealt > 0 || p.attributes.stats.timeSurvived > 60);
    const sortedDamage = [...meaningfulParticipants].sort((a, b) => b.attributes.stats.damageDealt - a.attributes.stats.damageDealt);
    const myDamageRank = sortedDamage.findIndex(p => p.attributes.stats.playerId === accountId) + 1;
    const myDamagePercentile = Math.round(((meaningfulParticipants.length - myDamageRank) / meaningfulParticipants.length) * 100);
    
    const top15Players = sortedDamage.slice(0, 15);
    const top15Baseline = {
      avgDamage: Math.round(top15Players.reduce((acc, p) => acc + p.attributes.stats.damageDealt, 0) / 15),
      avgKills: Number((top15Players.reduce((acc, p) => acc + p.attributes.stats.kills, 0) / 15).toFixed(1)),
      realTradeLatency: 850, realInitiativeSuccess: 55, realDeathDistance: 25
    };

    // [킬 순위 계산]
    const sortedKills = [...meaningfulParticipants].sort((a, b) => {
      if (b.attributes.stats.kills !== a.attributes.stats.kills) {
        return b.attributes.stats.kills - a.attributes.stats.kills;
      }
      return b.attributes.stats.damageDealt - a.attributes.stats.damageDealt;
    });
    const myKillRank = sortedKills.findIndex(p => p.attributes.stats.playerId === accountId) + 1;

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
        
        // [DB] 마스터 캐시 저장 (Fire and Forget)
        supabase.from("match_master_telemetry").upsert({
          match_id: matchId, map_name: matchAttr.mapName, game_mode: matchAttr.gameMode,
          telemetry_events: telData.slice(0, 50000) // 용량 제한 안전장치
        }).then(({ error }) => {
          if (error) console.error(`[DB] Master Cache Save Failed: ${matchId}`, error);
          else console.log(`[DB] Master Telemetry Cached: ${matchId}`);
        });
      }
    }

    // [V30] 정밀 지표 변수 및 텔레메트리 1차 루프
    const goldenTimeDamage = { early: 0, mid1: 0, mid2: 0, late: 0 };
    const killContribution = { solo: 0, cleanup: 0, other: 0 };
    const teammateKnockEvents: any[] = [];
    const myDamageEvents: any[] = [];
    let bluezoneWasteCount = 0; let lastBluezoneDamageTime = 0;
    const startEvent = telData.find(e => e._T === "LogMatchStart");
    const matchStartTime = startEvent ? new Date(startEvent._D).getTime() : 0;

    telData.forEach((e: any) => {
      const ts = new Date(e._D).getTime();
      const elapsed = (ts - matchStartTime) / 1000;
      if (e._T === "LogPlayerTakeDamage" && e.attacker && normalizeName(e.attacker.name) === lowerNickname && e.victim && normalizeName(e.victim.name) !== lowerNickname) {
        const dmg = e.damage || 0;
        if (elapsed <= 300) goldenTimeDamage.early += dmg;
        else if (elapsed <= 900) goldenTimeDamage.mid1 += dmg;
        else if (elapsed <= 1500) goldenTimeDamage.mid2 += dmg;
        else goldenTimeDamage.late += dmg;
        myDamageEvents.push({ ts, victim: e.victim.name, dmg });
      }
      if (e._T === "LogPlayerMakeDBNO" && e.victim && teamNames.has(normalizeName(e.victim.name)) && normalizeName(e.victim.name) !== lowerNickname) {
        teammateKnockEvents.push({ ts, victim: e.victim.name, attacker: e.attacker?.name });
      }
      if (e._T === "LogPlayerTakeDamage" && normalizeName(e.victim?.name) === lowerNickname && (e.damageTypeCategory === "Damage_BlueZone" || e.damageTypeCategory === "Damage_OutsidePlayZone")) {
        lastBluezoneDamageTime = ts;
      }
      if (e._T === "LogPlayerKill" && normalizeName(e.victim?.name) === lowerNickname) {
        if (lastBluezoneDamageTime > 0 && ts - lastBluezoneDamageTime < 120000) bluezoneWasteCount++;
      }
    });

    const myKillEvents = telData.filter(e => (e._T === "LogPlayerKill" || e._T === "LogPlayerKillV2") && normalizeName(e.killer?.name || e.attacker?.name) === lowerNickname);
    myKillEvents.forEach(k => {
      const victimName = k.victim.name;
      const victimDamage = telData.filter(e => e._T === "LogPlayerTakeDamage" && e.victim?.name === victimName);
      const myTotalDmg = victimDamage.filter(e => normalizeName(e.attacker?.name) === lowerNickname).reduce((acc, e) => acc + (e.damage || 0), 0);
      const totalDmg = victimDamage.reduce((acc, e) => acc + (e.damage || 0), 0);
      if (myTotalDmg >= totalDmg * 0.7) killContribution.solo++;
      else if (myTotalDmg > 0) killContribution.cleanup++;
      else killContribution.other++;
    });

    let totalLatency = 0; let latencyCount = 0;
    teammateKnockEvents.forEach(tk => {
      const firstResponse = myDamageEvents.find(md => md.ts > tk.ts && md.ts < tk.ts + 15000);
      if (firstResponse) { totalLatency += (firstResponse.ts - tk.ts); latencyCount++; }
    });

    const finalResult = {
      matchId, mapName: MAP_NAMES[matchAttr.mapName] || matchAttr.mapName, createdAt: matchAttr.createdAt, gameMode: matchAttr.gameMode,
      stats: myInfo.attributes.stats, team: teamStats, v: 30, top10Baseline: top15Baseline,
      myRank: { 
        damageRank: myDamageRank, 
        damagePercentile: myDamagePercentile, 
        killRank: myKillRank,
        totalTeams: rosters.length,
        totalPlayers: participants.length
      },
      goldenTimeDamage, killContribution, avgTradeLatency: latencyCount > 0 ? totalLatency / latencyCount : 0,
      bluezoneWasteCount, initiativeSuccessRate: 50, processedAt: new Date().toISOString()
    };

    // [DB] 최종 분석 결과 저장
    supabase.from("processed_match_telemetry").upsert({
      match_id: matchId, player_id: lowerNickname,
      data: { fullResult: finalResult }
    }).then(({ error }) => {
      if (error) console.error(`[DB] Player Cache Save Failed: ${matchId}`, error);
      else console.log(`[DB] User Analysis (V30) Cached: ${matchId} for ${lowerNickname}`);
    });

    return NextResponse.json(finalResult);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
