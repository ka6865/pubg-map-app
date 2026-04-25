import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAP_NAMES: Record<string, string> = {
  "Baltic_Main": "에란겔", "Savage_Main": "사녹", "Desert_Main": "미라마",
  "Summerland_Main": "카라킨", "Chimera_Main": "파라모", "Tiger_Main": "태이고",
  "Kiki_Main": "데스턴", "Neon_Main": "론도"
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId");
  const nickname = searchParams.get("nickname");
  const platform = searchParams.get("platform") || "steam";
  const forceBenchmark = searchParams.get("forceBenchmark") === "true";
  const minDamageParam = searchParams.get("minDamage");
  const minDamageThreshold = minDamageParam ? parseInt(minDamageParam) : 400;

  const normalizeName = (n: string) => n?.toLowerCase().trim() || "";
  const lowerNickname = normalizeName(nickname || "");

  if (!matchId || !nickname) return NextResponse.json({ error: "파라미터 부족" }, { status: 400 });

  const apiKey = (process.env.PUBG_API_KEY || "").split(" ")[0];
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/vnd.api+json" };

  try {
    const res = await fetch(`https://api.pubg.com/shards/${platform}/matches/${matchId}`, { headers, cache: "no-store" });
    if (!res.ok) throw new Error("매치 정보 로드 실패");
    const data = await res.json();
    const matchAttr = data.data.attributes;

    const participants = data.included.filter((item: any) => item.type === "participant");
    const rosters = data.included.filter((item: any) => item.type === "roster");
    const myInfo = participants.find((p: any) => normalizeName(p.attributes.stats.name) === lowerNickname);
    if (!myInfo) throw new Error("플레이어 미발견");

    const myRoster = rosters.find((r: any) => r.relationships.participants.data.some((p: any) => p.id === myInfo.id));
    const teamStats = myRoster ? myRoster.relationships.participants.data.map((pRef: any) => participants.find((p: any) => p.id === pRef.id)?.attributes.stats).filter(Boolean) : [myInfo.attributes.stats];
    const teamNames: Set<string> = new Set(teamStats.map((m: any) => normalizeName(m.name)));

    // [V5.0] 딜량 기반 랭킹 계산 (벤치마크 필터용)
    const allStats = participants.map((p: any) => p.attributes.stats);
    const sortedByDamage = [...allStats].sort((a, b) => b.damageDealt - a.damageDealt);
    const myDamageRank = sortedByDamage.findIndex((s: any) => normalizeName(s.name) === lowerNickname) + 1;

    // [DB] V5.25 캐시 체크
    const { data: fullCache } = await supabase.from("processed_match_telemetry").select("data").eq("match_id", matchId).eq("player_id", lowerNickname).single();
    if (fullCache && (fullCache.data as any).fullResult?.v >= 5.25) {
      console.log(`[DB] 5.25 Cache Hit: ${matchId}`);
      return NextResponse.json((fullCache.data as any).fullResult);
    }

    // 글로벌 엘리트 벤치마크 데이터 로드 (전체 랭커 데이터 기반)
    const { data: elitePool } = await supabase.from("global_benchmarks").select("*");
    const eliteAvgDamage = elitePool?.length ? Math.round(elitePool.reduce((a, b) => a + (b.damage || 0), 0) / elitePool.length) : 450;
    const eliteAvgKills = elitePool?.length ? Number((elitePool.reduce((a, b) => a + (b.kills || 0), 0) / elitePool.length).toFixed(1)) : 3.0;
    const validLatencies = elitePool?.filter(p => (p.latency_ms || 0) > 0) || [];
    const eliteAvgLatency = validLatencies.length ? Math.round(validLatencies.reduce((a, b) => a + b.latency_ms, 0) / validLatencies.length) : 1800;
    const eliteAvgReviveRate = elitePool?.length ? Math.round(elitePool.reduce((a, b) => a + (b.revive_rate || 80), 0) / elitePool.length) : 80;
    const eliteAvgSmokeRate = elitePool?.length ? Math.round(elitePool.reduce((a, b) => a + (b.smoke_rate || 60), 0) / elitePool.length) : 60;
    const eliteAvgSuppCount = elitePool?.length ? Number((elitePool.reduce((a, b) => a + (b.supp_count || 3), 0) / elitePool.length).toFixed(1)) : 3.0;
    const eliteAvgInitiative = elitePool?.length ? Math.round(elitePool.reduce((a, b) => a + (b.initiative_rate || 55), 0) / elitePool.length) : 55;
    const eliteAvgDistance = elitePool?.length ? Math.round(elitePool.reduce((a, b) => a + (b.team_distance || 30), 0) / elitePool.length) : 30;
    const eliteAvgWipes = elitePool?.length ? Number((elitePool.reduce((a, b) => a + (b.team_wipes || 1), 0) / elitePool.length).toFixed(1)) : 1.5;

    // 텔레메트리 로드 및 V3.0 다이어트
    const telemetryAsset = data.included.find((item: any) => item.type === "asset");
    let telData: any[] = [];
    if (telemetryAsset) {
      const { data: masterCache } = await supabase.from("match_master_telemetry").select("telemetry_events, telemetry_version").eq("match_id", matchId).single();
      if (masterCache && (masterCache as any).telemetry_version >= 8) {
        telData = masterCache.telemetry_events;
      } else {
        const telRes = await fetch(telemetryAsset.attributes.URL);
        const rawTel = await telRes.json();
        
        // V3.0 전술 윈도잉 필터링
        const teammateKnockTimes: number[] = rawTel.filter((e: any) => ["LogPlayerMakeDBNO", "LogPlayerKill"].includes(e._T) && teamNames.has(normalizeName(e.victim?.name))).map((e: any) => new Date(e._D).getTime());
        
        telData = rawTel.filter((e: any) => {
          const types = ["LogMatchStart", "LogPlayerKill", "LogPlayerKillV2", "LogPlayerMakeGroggy", "LogPlayerMakeDBNO", "LogPlayerTakeDamage", "LogItemUse", "LogPlayerRevive"];
          if (types.includes(e._T)) return true;
          if (e._T === "LogPlayerAttack") {
            const atkName = normalizeName(e.attacker?.name || "");
            const weapId = e.weapon?.itemId || "";
            if (weapId.toLowerCase().includes("smoke") || weapId.toLowerCase().includes("grenade") || weapId.toLowerCase().includes("molotov")) {
              return teamNames.has(atkName);
            }
            if (atkName === lowerNickname) {
              const ts = new Date(e._D).getTime();
              return teammateKnockTimes.some(tkTs => ts >= tkTs - 5000 && ts <= tkTs + 30000);
            }
          }
          return false;
        }).slice(0, 30000).map((e: any) => {
          if (e._T === "LogPlayerRevive") return e;
          const slim: any = { _T: e._T, _D: e._D };
          const actors = ["attacker", "victim", "killer", "maker", "character", "reviver", "downed"];
          actors.forEach(key => {
            if (e[key]) {
              slim[key] = typeof e[key] === 'string' ? { name: e[key] } : { name: e[key].name };
              if (e[key].location) slim[key].loc = { x: e[key].location.x, y: e[key].location.y, z: e[key].location.z };
            }
          });
          if (e.damage !== undefined) slim.damage = e.damage;
          if (e.damageTypeCategory) slim.damageTypeCategory = e.damageTypeCategory;
          if (e.item?.itemId || e.itemId) slim.itemId = e.item?.itemId || e.itemId;
          if (e.weapon?.itemId) slim.weaponId = e.weapon.itemId;
          return slim;
        });

        supabase.from("match_master_telemetry").upsert({ match_id: matchId, map_name: matchAttr.mapName, game_mode: matchAttr.gameMode, telemetry_events: telData, telemetry_version: 8 }).then();
      }
    }

    // [V3.0] 핵심 분석 엔진
    telData.sort((a, b) => new Date(a._D).getTime() - new Date(b._D).getTime());
    const startEvent = telData.find(e => e._T === "LogMatchStart");
    const matchStartTime = startEvent ? new Date(startEvent._D).getTime() : 0;

    const calcDist3D = (l1: any, l2: any) => {
      if (!l1 || !l2) return 999;
      return Math.sqrt(Math.pow((l1.x-l2.x)/100, 2) + Math.pow((l1.y-l2.y)/100, 2) + Math.pow((l1.z-l2.z)/100, 2));
    };

    const playerCombatData = new Map<string, { total: number; success: number; sessions: Map<string, any> }>();
    const eliteNames: Set<string> = new Set(elitePool?.map((p: any) => normalizeName(p.player_id)) || []);
    const myAttackEvents: any[] = [], smokeUseEvents: any[] = [], teamSmokeEvents: any[] = [], myDamageEvents: any[] = [], teammateKnockEvents: any[] = [];
    const myActionTimestamps: number[] = [], myReviveEvents: any[] = [], itemUseEvents: string[] = [];
    const myRecentDamageTaken = new Map<string, number>();
    const itemUseDetails: any[] = [];
    const damageDetails: any[] = [];
    const goldenTimeDamage = { early: 0, mid1: 0, mid2: 0, late: 0 };
    const bluezoneDamage = { myEarly: 0, myLate: 0, teamEarly: 0, teamLate: 0 };
    const bluezoneKnockTimes = new Set<number>();
    const combatPressure = { totalHits: 0, uniqueVictims: new Set<string>(), maxHitDistance: 0, utilityDamage: 0, utilityHits: 0 };
    const teamsUserHit = new Set<string>();
    const wipedTeamsByUserParticipation = new Set<string>();
    let bzWaste = 0, bzLastTime = 0, bzAccum = 0, reactLatSum = 0, reactCount = 0, deathDistance = 0;
    
    let myDeathTime: number | null = null;
    const myDownedIntervals: { start: number; end: number | null }[] = [];
    
    const teamMapping = new Map<string, string>();
    const teamAliveMembers = new Map<string, Set<string>>();
    rosters.forEach((r: any) => {
      const rId = r.id;
      const members = new Set<string>();
      r.relationships.participants.data.forEach((pRef: any) => {
        const p = participants.find((part: any) => part.id === pRef.id);
        if (p) {
          const name = normalizeName(p.attributes.stats.name);
          teamMapping.set(name, rId);
          members.add(name);
        }
      });
      teamAliveMembers.set(rId, members);
    });

    const victimDamage = new Map<string, { total: number; user: number }>();
    const killContribution = { solo: 0, cleanup: 0, other: 0 };
    const myRosterId = teamMapping.get(lowerNickname);

    telData.forEach((e: any) => {
      const ts = new Date(e._D).getTime();
      const elapsed = (ts - matchStartTime) / 1000;
      const attackerName = normalizeName(e.attacker?.name || e.killer?.name || e.maker?.name || e.character?.name || "");
      const victimName = normalizeName(e.victim?.name || "");

      // 1. 주도권 분석
      if (e._T === "LogPlayerTakeDamage" && e.attacker && e.victim && attackerName !== victimName) {
        [attackerName, victimName].forEach(name => {
          if (name === lowerNickname || eliteNames.has(name)) {
            let pData = playerCombatData.get(name);
            if (!pData) { pData = { total: 0, success: 0, sessions: new Map() }; playerCombatData.set(name, pData); }
            const opponent = name === attackerName ? victimName : attackerName;
            const session = pData.sessions.get(opponent);
            if (!session || ts - Math.max(session.lastHitByEnemy, session.lastHitByUser) > 120000) {
              pData.sessions.set(opponent, { lastHitByEnemy: name === victimName ? ts : 0, lastHitByUser: name === attackerName ? ts : 0, userStarted: name === attackerName, alreadySucceeded: false });
              if (name === attackerName) pData.total++;
            } else {
              if (name === attackerName) session.lastHitByUser = ts;
              else session.lastHitByEnemy = ts;
            }
          }
        });
      }

      // 2. 행동 수집
      if (e._T === "LogPlayerAttack" && attackerName === lowerNickname) {
        const weaponId = (e.weaponId || "").toLowerCase();
        if (weaponId.includes("smoke") || weaponId.includes("grenade") || weaponId.includes("molotov")) {
          itemUseDetails.push({ time: e._D, playerName: attackerName, itemId: e.weaponId, itemName: e.weaponId });
          if (weaponId.includes("smoke")) smokeUseEvents.push({ ts, loc: e.attacker?.loc });
        }
        myAttackEvents.push({ ts, loc: e.attacker?.loc });
      }
      if (e._T === "LogItemUse" && attackerName === lowerNickname) {
        if (e.itemId) { 
          itemUseEvents.push(e.itemId); 
          itemUseDetails.push({ time: e._D, playerName: attackerName, itemId: e.itemId, itemName: e.itemId });
          if (e.itemId.toLowerCase().includes("smoke")) smokeUseEvents.push({ ts, loc: e.character?.loc }); 
        }
      }
      if (e._T === "LogPlayerRevive") {
        const revName = normalizeName(e.reviver?.name || (typeof e.reviver === 'string' ? e.reviver : ""));
        const vicName = normalizeName(e.victim?.name || e.character?.name || (typeof e.victim === 'string' ? e.victim : ""));
        if (revName === lowerNickname && teamNames.has(vicName)) myReviveEvents.push({ ts, victim: vicName });
        if (vicName === lowerNickname) {
          const last = myDownedIntervals[myDownedIntervals.length - 1];
          if (last && last.end === null) last.end = ts;
        }
      }

      if (e._T === "LogPlayerTakeDamage") {
        if (attackerName === lowerNickname && victimName !== lowerNickname) {
          const dmg = e.damage || 0;
          if (elapsed <= 300) goldenTimeDamage.early += dmg; 
          else if (elapsed <= 900) goldenTimeDamage.mid1 += dmg; 
          else if (elapsed <= 1500) goldenTimeDamage.mid2 += dmg; 
          else goldenTimeDamage.late += dmg;
          
          let vDmg = victimDamage.get(victimName);
          if (!vDmg) { vDmg = { total: 0, user: 0 }; victimDamage.set(victimName, vDmg); }
          vDmg.total += dmg;
          vDmg.user += dmg;
          
          combatPressure.totalHits++;
          combatPressure.uniqueVictims.add(victimName);
          const dist = calcDist3D(e.attacker?.loc, e.victim?.loc);
          if (dist !== 999 && dist > combatPressure.maxHitDistance) combatPressure.maxHitDistance = Math.round(dist);

          const isUtility = (e.damageTypeCategory || "").includes("Grenade") || 
                            (e.damageTypeCategory || "").includes("Molotov") ||
                            (e.damageTypeCategory || "").includes("C4") ||
                            (e.damageTypeCategory || "").includes("StickGrenade");
          if (isUtility) {
              combatPressure.utilityDamage += dmg;
              combatPressure.utilityHits++;
          }

          // [V4.91] 유저가 타격한 팀 기록
          const vRosterId = teamMapping.get(victimName);
          if (vRosterId && vRosterId !== myRosterId) teamsUserHit.add(vRosterId);

          damageDetails.push({ time: e._D, attackerName, victimName, damage: dmg, damageTypeCategory: e.damageTypeCategory });
          myDamageEvents.push({ ts, victim: victimName, loc: e.attacker?.loc, victimLoc: e.victim?.loc });
          const lastHit = myRecentDamageTaken.get(victimName);
          if (lastHit && ts - lastHit < 5000) { reactLatSum += (ts - lastHit); reactCount++; myRecentDamageTaken.delete(victimName); }
        } else if (victimName === lowerNickname && attackerName && attackerName !== lowerNickname) {
          myRecentDamageTaken.set(attackerName, ts);
          damageDetails.push({ time: e._D, attackerName, victimName, damage: e.damage, damageTypeCategory: e.damageTypeCategory });
          if (e.damageTypeCategory?.includes("BlueZone")) { 
            bzLastTime = ts; 
            bzAccum += (e.damage || 0); 
            if (elapsed <= 900) bluezoneDamage.myEarly += (e.damage || 0);
            else bluezoneDamage.myLate += (e.damage || 0);
          }
        }

        if (victimName !== lowerNickname && victimName !== "" && attackerName !== lowerNickname) {
          if (teamNames.has(victimName)) {
            if (e.damageTypeCategory?.includes("BlueZone")) {
              bluezoneKnockTimes.add(ts);
              if (elapsed <= 900) bluezoneDamage.teamEarly += (e.damage || 0);
              else bluezoneDamage.teamLate += (e.damage || 0);
            }
          }
          let vDmg = victimDamage.get(victimName);
          if (!vDmg) { vDmg = { total: 0, user: 0 }; victimDamage.set(victimName, vDmg); }
          vDmg.total += (e.damage || 0);
        }
      }

      if (e._T === "LogPlayerMakeDBNO" || e._T === "LogPlayerKill" || e._T === "LogPlayerKillV2" || e._T === "LogPlayerMakeGroggy") {
        if (attackerName === lowerNickname) myActionTimestamps.push(ts);
        if (victimName && !teamNames.has(victimName)) {
          teamNames.forEach((m: string) => {
            const mData = playerCombatData.get(m);
            const session = mData?.sessions.get(victimName);
            if (session?.userStarted && !session.alreadySucceeded) { mData!.success++; session.alreadySucceeded = true; }
          });

          if (e._T === "LogPlayerKill" || e._T === "LogPlayerKillV2") {
            const vDmg = victimDamage.get(victimName) || { total: 0, user: 0 };
            if (attackerName === lowerNickname) {
              if (vDmg.total > 0 && vDmg.user / vDmg.total >= 0.7) killContribution.solo++;
              else killContribution.cleanup++;
            } else {
              killContribution.other++;
            }

            const vRosterId = teamMapping.get(victimName);
            if (vRosterId && vRosterId !== myRosterId) {
              const members = teamAliveMembers.get(vRosterId);
              if (members && (e._T === "LogPlayerKill" || e._T === "LogPlayerKillV2")) {
                members.delete(victimName);
                if (members.size === 0) {
                  // [V4.91] 내가 해당 팀원을 한 명이라도 사살했거나 마지막 인원을 잡은 경우 기여 인정
                  if (teamsUserHit.has(vRosterId) || attackerName === lowerNickname) {
                    wipedTeamsByUserParticipation.add(vRosterId);
                  }
                }
              }
            }
          }
        }
        if (teamNames.has(victimName) && victimName !== lowerNickname) {
          // [V5.20] 자기장 데미지 추적(bluezoneKnockTimes)을 통한 정확한 후반 자기장 기절 판정
          const isLateBluezone = elapsed > 900 && (bluezoneKnockTimes.has(ts) || e.damageTypeCategory === "BlueZone" || e.damageReason === "BlueZone");
          if (!isLateBluezone) {
            if (!teammateKnockEvents.some(tk => tk.victim === victimName && ts - tk.ts < 15000)) {
              teammateKnockEvents.push({ ts, victim: victimName, attacker: attackerName, victimLoc: e.victim?.loc, attackerLoc: e.attacker?.loc || e.killer?.loc || e.maker?.loc });
            }
          }
        }
        if (victimName === lowerNickname && (e._T === "LogPlayerMakeDBNO" || e._T === "LogPlayerMakeGroggy")) {
          myDownedIntervals.push({ start: ts, end: null });
        }
        if (victimName === lowerNickname && (e._T === "LogPlayerKill" || e._T === "LogPlayerKillV2")) {
          const last = myDownedIntervals[myDownedIntervals.length - 1];
          if (last && last.end === null) last.end = ts;
          myDeathTime = ts;
          const dDist = calcDist3D(e.victim?.loc, e.attacker?.loc || e.killer?.loc);
          if (dDist !== 999) deathDistance = Math.round(dDist);
        }
      }

      if (e._T === "LogPlayerKill" && victimName === lowerNickname) {
        if (bzAccum >= 30 && ts - bzLastTime < 30000) bzWaste++;
      }
    });

    // 지표 산출
    let tradeLatSum = 0, tradeCount = 0;
    const isPlayerActionable = (ts: number) => {
      if (myDeathTime && ts >= myDeathTime) return false;
      const isDowned = myDownedIntervals.some(interval => ts >= interval.start && (interval.end === null || ts <= interval.end));
      return !isDowned;
    };

    const tacticalTimeline = teammateKnockEvents.map(tk => {
      const myDeath = myDeathTime !== null && tk.ts >= myDeathTime;
      const myKnock = myDownedIntervals.some(iv => tk.ts >= iv.start && (iv.end === null || tk.ts <= iv.end));
      
      // [V5.19] 유저 자신이 위기인 상황 (자기장 피해 중이거나 아군 기절 후 15초 이내에 기절/사망)
      const userInBluezone = bzLastTime > 0 && Math.abs(tk.ts - bzLastTime) < 5000 && bzAccum > 20;
      const willBeKnockedSoon = myDownedIntervals.some(iv => iv.start > tk.ts && iv.start < tk.ts + 15000);
      const willDieSoon = myDeathTime !== null && myDeathTime > tk.ts && myDeathTime < tk.ts + 15000;

      const actionable = !myDeath && !myKnock && !userInBluezone && !willBeKnockedSoon && !willDieSoon;
      const playerSmk = actionable && smokeUseEvents.some(s => s.ts >= tk.ts - 5000 && s.ts <= tk.ts + 40000);
      const teamSmk = teamSmokeEvents.some(s => s.ts >= tk.ts - 5000 && s.ts <= tk.ts + 40000);
      const hasSmk = playerSmk || teamSmk;
      const didIRevive = myReviveEvents.some(r => r.victim === tk.victim && r.ts >= tk.ts && r.ts <= tk.ts + 120000);
      const hasRev = didIRevive;
      const isRevOpportunity = actionable || didIRevive;
      
      const hit = actionable && (
        myDamageEvents.find(md => md.ts > tk.ts && md.ts < tk.ts + 30000) ||
        myActionTimestamps.find(ats => ats > tk.ts && ats < tk.ts + 30000)
      );
      if (hit) { 
        const hitTs = typeof hit === 'number' ? hit : hit.ts;
        tradeLatSum += (hitTs - tk.ts); 
        tradeCount++; 
      }
      const myLoc = myAttackEvents.find(a => Math.abs(a.ts - tk.ts) < 5000)?.loc || myDamageEvents.find(d => Math.abs(d.ts - tk.ts) < 5000)?.loc;
      const dToEnemy = calcDist3D(myLoc, tk.attackerLoc);
      const dToTeammate = calcDist3D(myLoc, tk.victimLoc);
      const isDangerous = dToEnemy <= 150 || dToEnemy > 900;
      
      // [V5.21] 견제 사격 예외 조건: 거리가 400m 이상이거나 적이 5초 내에 이미 처단된 경우
      const enemyKilledFast = telData.some(e => (e._T === "LogPlayerKill" || e._T === "LogPlayerKillV2") && normalizeName(e.victim?.name) === tk.attacker && new Date(e._D).getTime() <= tk.ts + 5000);
      const isSuppNeeded = dToEnemy < 400 && !enemyKilledFast;
      const hasSupp = isSuppNeeded ? !!hit : true; // 필요 없는 상황이면 수행한 것으로 간주하여 패널티 방지

      return { victim: tk.victim, ts: tk.ts, isActionable: actionable, isRevOpportunity, distUserToTeammate: dToTeammate, distUserToEnemy: dToEnemy, heightDiff: myLoc && tk.victimLoc ? (myLoc.z - tk.victimLoc.z)/100 : 0, hasSuppression: hasSupp, hasSmoke: hasSmk, hasPlayerSmoke: playerSmk, hasTeamSmoke: teamSmk, isDangerous, hasRevive: hasRev };
    });

    const actionableTimeline = tacticalTimeline.filter((t: any) => t.isActionable);
    const teammateKnocks = tacticalTimeline.filter((t: any) => t.isRevOpportunity).length;
    const dangerousKnocks = actionableTimeline.filter((t: any) => t.isDangerous).length;
    const suppCount = actionableTimeline.filter((t: any) => t.hasSuppression).length;
    const smokeOpps = dangerousKnocks;
    const smokeCount = actionableTimeline.filter((t: any) => t.isDangerous && t.hasPlayerSmoke).length;
    const teamSmokeCovered = actionableTimeline.filter((t: any) => t.isDangerous && t.hasTeamSmoke && !t.hasPlayerSmoke).length;
    const revCount = myReviveEvents.length;
    const totalEnemyTeamWipes = wipedTeamsByUserParticipation.size;

    let baitCount = 0;
    const teamDeaths = telData.filter(e => (e._T === "LogPlayerKill" || e._T === "LogPlayerKillV2") && teamNames.has(normalizeName(e.victim?.name)) && normalizeName(e.victim?.name) !== lowerNickname).map(e => new Date(e._D).getTime());
    teamDeaths.forEach(dTs => { 
      if (isPlayerActionable(dTs)) {
        if (myActionTimestamps.filter(ts => ts > dTs && ts <= dTs + 10000).length >= 2) baitCount++; 
      }
    });

    const myCombatData = playerCombatData.get(lowerNickname) || { total: 0, success: 0 };
    const myKillRank = [...allStats].sort((a: any, b: any) => b.kills - a.kills).findIndex((s: any) => normalizeName(s.name) === lowerNickname) + 1;
    
    const finalResult = {
      matchId, v: 5.30, processedAt: new Date().toISOString(), stats: myInfo.attributes.stats, team: teamStats,
      totalTeamKills: teamStats.reduce((acc: number, m: any) => acc + m.kills, 0),
      totalTeamDamage: teamStats.reduce((acc: number, m: any) => acc + (m.damageDealt || 0), 0),
      myRank: {
        damageRank: myDamageRank,
        damagePercentile: Math.round((1 - (myDamageRank / participants.length)) * 100),
        killRank: myKillRank,
        totalTeams: rosters.length,
        totalPlayers: participants.length
      },
      mapName: MAP_NAMES[matchAttr.mapName] || matchAttr.mapName,
      gameMode: matchAttr.gameMode,
      matchType: matchAttr.matchType,
      createdAt: matchAttr.createdAt,
      survivalTimeSec: myInfo.attributes.stats.timeSurvived || 0,
      tradeStats: {
        teammateKnocks, dangerousKnocks, smokeOpps, suppCount, smokeCount, teamSmokeCovered, revCount, baitCount,
        teamWipeOccurred: wipedTeamsByUserParticipation.size > 0, enemyTeamWipes: wipedTeamsByUserParticipation.size,
        backupLatencyMs: tradeCount > 0 ? Math.round(tradeLatSum / tradeCount) : 0,
        reactionLatencyMs: reactCount > 0 ? Math.round(reactLatSum / reactCount) : 0,
        coverRate: teammateKnockEvents.length > 0 ? Math.round((tradeCount / teammateKnockEvents.length) * 100) : 0
      },
      killContribution,
      deathDistance,
      initiativeStats: { total: myCombatData.total, success: myCombatData.success, rate: myCombatData.total > 0 ? Math.round((myCombatData.success / myCombatData.total) * 100) : 0 },
      goldenTimeDamage, bluezoneWasteCount: bzWaste,
      combatPressure: {
        totalHits: combatPressure.totalHits,
        uniqueVictims: Array.from(combatPressure.uniqueVictims),
        maxHitDistance: combatPressure.maxHitDistance,
        utilityDamage: Math.round(combatPressure.utilityDamage),
        utilityHits: combatPressure.utilityHits
      },
      myEarlyBluezoneDamage: bluezoneDamage.myEarly,
      myLateBluezoneDamage: bluezoneDamage.myLate,
      teamEarlyBluezoneDamage: bluezoneDamage.teamEarly + bluezoneDamage.myEarly,
      teamLateBluezoneDamage: bluezoneDamage.teamLate + bluezoneDamage.myLate,
      itemUseDetails,
      damageDetails,
      eliteBenchmark: { 
        avgDamage: eliteAvgDamage, 
        avgKills: eliteAvgKills, 
        realTradeLatency: eliteAvgLatency, 
        realInitiativeSuccess: eliteAvgInitiative, 
        realDeathDistance: eliteAvgDistance,
        realReviveRate: eliteAvgReviveRate,
        realSmokeRate: eliteAvgSmokeRate,
        realSuppCount: eliteAvgSuppCount,
        realTeamWipes: eliteAvgWipes
      }
    };

    // [V5.26] 상위권 벤치마크 데이터 수집 조건 정밀화
    // 1. (경쟁전 여부 OR 강제 수집 플래그), 2. 고성능 기준 통과
    const isCompetitive = matchAttr.gameMode.includes('competitive') || matchAttr.matchType === 'competitive';
    const myStats = myInfo.attributes.stats;
    const isHighPerformer = myStats.damageDealt >= minDamageThreshold || (myStats.winPlace <= 3 && myStats.damageDealt >= (minDamageParam ? minDamageThreshold : 250));

    const isTpp = !matchAttr.gameMode.includes('fpp');
    const isNotTdm = matchAttr.gameMode !== 'tdm';

    if ((isCompetitive || forceBenchmark) && isHighPerformer && isTpp && isNotTdm) {
      supabase.from("global_benchmarks").upsert({
        match_id: matchId,
        player_id: lowerNickname,
        damage: myStats.damageDealt,
        kills: myStats.kills,
        win_place: myStats.winPlace,
        game_mode: matchAttr.gameMode,
        latency_ms: tradeCount > 0 ? Math.min(Math.round(tradeLatSum / tradeCount), 10000) : 0,
        initiative_rate: myCombatData.total > 0 ? Math.round((myCombatData.success / myCombatData.total) * 100) : 0,
        revive_rate: teammateKnocks > 0 ? Math.round((revCount / teammateKnocks) * 100) : 0,
        smoke_rate: smokeOpps > 0 ? Math.round((smokeCount / smokeOpps) * 100) : 0,
        supp_count: suppCount,
        team_distance: deathDistance > 0 ? deathDistance : 30,
        team_wipes: totalEnemyTeamWipes,
        utility_count: combatPressure.utilityHits,
        survival_time: Math.round(myStats.timeSurvived || 0),
        solo_kill_rate: myStats.kills > 0 ? Math.round((killContribution.solo / myStats.kills) * 100) : 0,
        burst_damage: Math.round(goldenTimeDamage.early + goldenTimeDamage.mid1 + goldenTimeDamage.mid2 + goldenTimeDamage.late),
        created_at: new Date().toISOString()
      }, { onConflict: "match_id, player_id" }).then();
    }

    supabase.from("processed_match_telemetry").upsert({ match_id: matchId, player_id: lowerNickname, data: { fullResult: finalResult }, updated_at: new Date().toISOString() }, { onConflict: 'match_id,player_id' }).then();
    return NextResponse.json(finalResult);
  } catch (error: any) {
    console.error("[MATCH-API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
