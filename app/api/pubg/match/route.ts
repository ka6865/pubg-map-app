import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    const allStats = participants.map((p: any) => p.attributes.stats);
    const sortedByDamage = [...allStats].sort((a, b) => b.damageDealt - a.damageDealt);
    const myDamageRank = sortedByDamage.findIndex((s: any) => normalizeName(s.name) === lowerNickname) + 1;

    const RESULT_VERSION = 8.5;
    const { data: cached } = await supabase.from("processed_match_telemetry").select("data, updated_at").eq("match_id", matchId).eq("player_id", lowerNickname).single();
    if (cached && (cached as any).data?.fullResult?.v >= RESULT_VERSION) {
        return NextResponse.json((cached as any).data.fullResult);
    }

    const isFpp = matchAttr.gameMode.includes('fpp');
    const isSquad = matchAttr.gameMode.includes('squad');
    
    // [V11] 신규 필터 버전(v2) 우선 조회 + 스쿼드/솔로 구분
    let eliteQuery = supabase.from("global_benchmarks").select("*").eq("filter_version", 2);
    if (isFpp) eliteQuery = eliteQuery.ilike('game_mode', '%fpp%');
    else eliteQuery = eliteQuery.not('game_mode', 'ilike', '%fpp%');
    
    if (isSquad) eliteQuery = eliteQuery.ilike('game_mode', '%squad%');
    else eliteQuery = eliteQuery.not('game_mode', 'ilike', '%squad%');

    const { data: elitePoolRaw } = await eliteQuery.order('created_at', { ascending: false }).limit(200);
    let elitePool = elitePoolRaw || [];

    // v2 샘플이 부족할 경우 v1 데이터를 하이브리드로 사용
    if (elitePool.length < 20) {
      let fallbackQuery = supabase.from("global_benchmarks").select("*").eq("filter_version", 1);
      if (isFpp) fallbackQuery = fallbackQuery.ilike('game_mode', '%fpp%');
      else fallbackQuery = fallbackQuery.not('game_mode', 'ilike', '%fpp%');
      
      if (isSquad) fallbackQuery = fallbackQuery.ilike('game_mode', '%squad%');
      else fallbackQuery = fallbackQuery.not('game_mode', 'ilike', '%squad%');
      
      const { data: v1Pool } = await fallbackQuery.order('created_at', { ascending: false }).limit(100);
      if (v1Pool) elitePool = [...elitePool, ...v1Pool];
    }

    const calcAvg = (arr: any[], key: string, def = 0) => arr.length ? arr.reduce((a, b) => a + (b[key] || 0), 0) / arr.length : def;
    const eliteAvgDamage = Math.round(calcAvg(elitePool, 'damage', 450));
    const eliteAvgKills = Number(calcAvg(elitePool, 'kills', 3.0).toFixed(1));
    const validLatencies = elitePool.filter(p => (p.counter_latency_ms || 0) > 0);
    const eliteAvgCounterLatency = validLatencies.length ? Math.round(validLatencies.reduce((a, b) => a + b.counter_latency_ms, 0) / validLatencies.length) : 1800;

    const telemetryAsset = data.included.find((item: any) => item.type === "asset");
    let telData: any[] = [];
    if (telemetryAsset) {
      const TELEMETRY_VERSION = 16; // 15->16: LogPlayerCreate 추가 및 고립 지수 필터링 강화
      const { data: masterCache } = await supabase.from("match_master_telemetry").select("telemetry_events, telemetry_version").eq("match_id", matchId).single();
      if (masterCache && (masterCache as any).telemetry_version >= TELEMETRY_VERSION) {
        telData = (masterCache as any).telemetry_events;
      } else {
        const telRes = await fetch(telemetryAsset.attributes.URL);
        const rawTel = await telRes.json();
        let positionEventCount = 0;
        telData = rawTel.filter((e: any) => {
          if (e._T === "LogPlayerPosition") {
            const pName = normalizeName(e.character?.name || "");
            if (teamNames.has(pName)) return true; // 팀원은 전수 저장
            // [V11] 비팀원(적군)만 1/10 샘플링하여 지표 오염 방지
            positionEventCount++;
            return positionEventCount % 10 === 0; 
          }
          return ["LogMatchStart", "LogPlayerCreate", "LogPlayerKill", "LogPlayerKillV2", "LogPlayerMakeGroggy", "LogPlayerMakeDBNO", "LogPlayerTakeDamage", "LogItemUse", "LogPlayerRevive", "LogExplosiveExplode", "LogProjectileProjectileHit", "LogPlayerAttack", "LogPlayerUseThrowable", "LogGameStatePeriodic", "LogParachuteLanding", "LogPhaseChange"].includes(e._T);
        }).slice(0, 50000).map((e: any) => {
          if (e._T === "LogPlayerCreate") return e;
          if (e._T === "LogPhaseChange") return { _T: e._T, _D: e._D, phase: e.phase };
          if (e._T === "LogPlayerRevive") return {
            _T: e._T, _D: e._D,
            reviver: { name: (typeof e.reviver === 'string' ? e.reviver : e.reviver?.name) },
            victim: { name: (typeof e.victim === 'string' ? e.victim : (e.victim?.name || e.character?.name)) }
          };
          // [V11] 착지 이벤트 위치 데이터 보존 (Slimming 가드)
          if (e._T === "LogParachuteLanding") return {
            _T: e._T, _D: e._D,
            character: { 
              name: e.character?.name, 
              loc: e.character?.location ? { x: Math.round(e.character.location.x/100), y: Math.round(e.character.location.y/100), z: Math.round((e.character.location.z||0)/100) } : null
            }
          };
          if (e._T === "LogGameStatePeriodic") return { _T: e._T, _D: e._D, gameState: { safetyZonePosition: { x: Math.round(e.gameState.safetyZonePosition.x / 100), y: Math.round(e.gameState.safetyZonePosition.y / 100) }, safetyZoneRadius: Math.round(e.gameState.safetyZoneRadius / 100) } };
          
          const slim: any = { _T: e._T, _D: e._D };
          const actors = ["attacker", "victim", "killer", "maker", "dBNOMaker", "finisher", "character", "downed"];
          actors.forEach(key => { 
            if (e[key]) { 
              slim[key] = { name: (typeof e[key] === 'string' ? e[key] : e[key].name) }; 
              const loc = e[key].location || e[key].Location || e[key].loc; 
              if (loc) slim[key].loc = { x: Math.round(loc.x / 100), y: Math.round(loc.y / 100), z: Math.round((loc.z || 0) / 100) }; 
            } 
          });
          if (e.location) slim.location = { x: Math.round(e.location.x / 100), y: Math.round(e.location.y / 100), z: Math.round((e.location.z || 0) / 100) };
          if (e.damage !== undefined) slim.damage = Number(e.damage.toFixed(1));
          if (e.damageTypeCategory) slim.damageTypeCategory = e.damageTypeCategory;
          if (e.damageReason) slim.damageReason = e.damageReason;
          const wId = e.weapon?.itemId || e.weaponId || e.explosiveId || e.itemId || e.damageCauserName;
          if (wId) slim.weaponId = wId;
          return slim;
        });
        // [V11] Master Cache 저장 시 await를 사용하여 Serverless 환경에서의 유실 방지
        await supabase.from("match_master_telemetry").upsert({ match_id: matchId, map_name: matchAttr.mapName, game_mode: matchAttr.gameMode, telemetry_events: telData, telemetry_version: TELEMETRY_VERSION });
      }
    }

    telData.sort((a, b) => new Date(a._D).getTime() - new Date(b._D).getTime());
    
    // [V11] MatchStartTime 최적화 (Fallback 적용)
    const startEvent = telData.find(e => e._T === "LogMatchStart");
    const firstEventTs = telData.length > 0 ? new Date(telData[0]._D).getTime() : 0;
    const matchStartTime = startEvent ? new Date(startEvent._D).getTime() : firstEventTs;
    
    const calcDist3D = (l1: any, l2: any) => (!l1 || !l2) ? 999 : Math.sqrt(Math.pow(l1.x - l2.x, 2) + Math.pow(l1.y - l2.y, 2) + Math.pow((l1.z || 0) - (l2.z || 0), 2));

    const playerCombatData = new Map(), myDamageEvents: any[] = [], teammateKnockEvents: any[] = [], myReviveEvents: any[] = [];
    const myAttackEvents = new Set<number>(); // 중복 체크 성능 최적화
    const myActionTimestamps: any[] = [], victimDamage = new Map(), weaponStats = new Map();
    const myRecentDamageTaken = new Map(); 
    const eliteNames = new Set(elitePool.map(p => normalizeName(p.player_id)));
    let lastZoneInfo = { x: 0, y: 0, radius: 0 };
    const zoneStrategy = { edgePlayCount: 0, fatalDelayCount: 0 };
    let totalCrossfireCount = 0, bluezoneWaste = 0;
    const dbnoIsolationSamples: number[] = []; 
    const combatPressure = { totalHits: 0, uniqueVictims: new Set(), maxHitDistance: 0, utilityDamage: 0, utilityHits: 0 };
    const teamsUserHit = new Set(), wipedTeamsByUserParticipation = new Set();
    let reactLatSum = 0, reactCount = 0, totalTimesHit = 0, deathDistance = 0, myDeathTime: string | null = null;
    let totalTeammateKnocks = 0, totalSuppCount = 0, totalSmokeCount = 0, totalBaitCount = 0;
    const reactionLatencies: number[] = []; 
    const tradeLatencies: number[] = [];
    const myDownedIntervals: any[] = [], playerLocations = new Map(), playerAliveStatus = new Map(), recentAttacksOnUser: any[] = [], teamMapping = new Map(), teamAliveMembers = new Map();
    const goldenTimeDamage = { early: 0, mid1: 0, mid2: 0, late: 0 };
    const killContribution = { solo: 0, cleanup: 0 };
    let totalIsolationSum = 0, isolationSampleCount = 0, totalMinDistSum = 0, totalHeightDiffSum = 0;
    const phaseTimeline: { phase: number, time: string }[] = [];

    rosters.forEach((r: any) => {
      const rId = r.id, members = new Set<string>();
      r.relationships.participants.data.forEach((pRef: any) => { const p = participants.find((part: any) => part.id === pRef.id); if (p) { const name = normalizeName(p.attributes.stats.name); teamMapping.set(name, rId); members.add(name); } });
      teamAliveMembers.set(rId, members);
    });

    const itemUseSummary = { smokes: 0, frags: 0, molotovs: 0, others: 0 };
    const myRosterId = teamMapping.get(lowerNickname);
    
    // [V11] 초기 상태 설정 강화 (LogPlayerCreate 기반)
    telData.forEach(e => { if (e._T === "LogPlayerCreate") playerAliveStatus.set(normalizeName(e.character?.name || ""), true); });
    teamNames.forEach(name => { if (!playerAliveStatus.has(name)) playerAliveStatus.set(name, true); });

    // [V11] 전술 지표 중복 방지용 타임스탬프
    let lastSuppTs = 0;

    telData.forEach((e: any) => {
      const ts = new Date(e._D).getTime(), elapsed = (ts - matchStartTime) / 1000;
      if (e._T === "LogGameStatePeriodic") { lastZoneInfo = { x: e.gameState.safetyZonePosition.x, y: e.gameState.safetyZonePosition.y, radius: e.gameState.safetyZoneRadius }; return; }
      const attackerName = normalizeName(e.attacker?.name || e.killer?.name || e.maker?.name || e.dBNOMaker?.name || e.finisher?.name || e.character?.name || "");
      const victimName = normalizeName(e.victim?.name || "");
      const updateLoc = (name: string, loc: any) => { if (name && loc) playerLocations.set(name, { x: loc.x, y: loc.y, z: loc.z || 0 }); };
      if (e.attacker) updateLoc(attackerName, e.attacker.loc); if (e.victim) updateLoc(victimName, e.victim.loc); if (e.character) updateLoc(normalizeName(e.character.name), e.character.loc); if (e.maker) updateLoc(normalizeName(e.maker.name), e.maker.loc); if (e.dBNOMaker) updateLoc(normalizeName(e.dBNOMaker.name), e.dBNOMaker.loc);

      const isVehicleDamage = (e.weaponId || "").toLowerCase().includes("vehicle") || (e.damageTypeCategory || "").toLowerCase().includes("vehicle");
      if (e._T === "LogPlayerTakeDamage" && e.attacker && e.victim && attackerName !== victimName && !isVehicleDamage) {
        [attackerName, victimName].forEach(name => {
          if (name === lowerNickname || eliteNames.has(name)) {
            let pData = playerCombatData.get(name); 
            if (!pData) { 
              pData = { total: 0, success: 0, duelWins: 0, duelLosses: 0, reversalWins: 0, sessions: new Map() }; 
              playerCombatData.set(name, pData); 
            }
            const opponent = name === attackerName ? victimName : attackerName, session = pData.sessions.get(opponent);
            if (!session || ts - Math.max(session.lastHitByEnemy, session.lastHitByUser) > 120000) { 
              pData.sessions.set(opponent, { 
                lastHitByEnemy: name === victimName ? ts : 0, 
                lastHitByUser: name === attackerName ? ts : 0, 
                userStarted: name === attackerName, 
                alreadySucceeded: false 
              }); 
              if (name === attackerName) pData.total++; 
            }
            else { 
              if (name === attackerName) session.lastHitByUser = ts; 
              else session.lastHitByEnemy = ts; 
            }
          }
        });
      }

      if (attackerName === lowerNickname && e._T === "LogPlayerTakeDamage" && teamNames.has(victimName) === false) {
        const isAnyTeammateDown = Array.from(playerAliveStatus.entries()).some(([name, status]) => teamNames.has(name) && name !== lowerNickname && status === "groggy");
        // [V11] 견제 사격 중복 카운트 방지 (5초 쿨다운)
        if (isAnyTeammateDown && (ts - lastSuppTs > 5000)) {
          totalSuppCount++;
          lastSuppTs = ts;
        }
      }

      if (e._T === "LogPlayerAttack" && attackerName === lowerNickname) {
        const wId = (e.weaponId || "").toLowerCase();
        if (wId.includes("smoke") || wId.includes("grenade") || wId.includes("molotov")) {
          if (!myAttackEvents.has(ts)) {
             if (wId.includes("smoke")) { 
               itemUseSummary.smokes++; 
               const isAnyTeammateDown = Array.from(playerAliveStatus.entries()).some(([name, status]) => teamNames.has(name) && name !== lowerNickname && status === "groggy");
               if (isAnyTeammateDown) totalSmokeCount++;
             }
             else if (wId.includes("grenade")) itemUseSummary.frags++; else if (wId.includes("molotov")) itemUseSummary.molotovs++; else itemUseSummary.others++;
          }
        }
        myAttackEvents.add(ts);
      }
      
      if (e._T === "LogPhaseChange") {
        phaseTimeline.push({ phase: e.phase, time: e._D });
      }

      if (e._T === "LogPlayerRevive") {
        const revName = normalizeName(e.reviver?.name || ""), vicName = normalizeName(e.victim?.name || "");
        if (revName === lowerNickname && teamNames.has(vicName)) myReviveEvents.push({ ts, victim: vicName });
        if (vicName === lowerNickname) { const last = myDownedIntervals[myDownedIntervals.length - 1]; if (last && last.end === null) last.end = ts; }
        // [V11] 생존 상태 업데이트 분리
        if (vicName) playerAliveStatus.set(vicName, true);
      }
      
      if (e._T === "LogPlayerCreate") {
        const pName = normalizeName(e.character?.name || "");
        if (pName) playerAliveStatus.set(pName, true);
      }

      if (e._T === "LogPlayerPosition") {
        const pName = normalizeName(e.character?.name || "");
        if (pName) {
          const charLoc = e.character.loc || e.character.location;
          if (charLoc) {
            playerLocations.set(pName, { x: charLoc.x, y: charLoc.y, z: charLoc.z || 0 });
            
            const isLanded = (charLoc.z || 0) < 10;
            const isAfterStart = elapsed > 120;
            
            if (pName === lowerNickname && (isLanded || isAfterStart) && playerAliveStatus.get(lowerNickname) !== false) {
            let minDist = 999999, minEnemyDist = 999999, hDiff = 0;
            
            teamNames.forEach(tName => {
              const status = playerAliveStatus.get(tName);
              if (tName !== lowerNickname && status !== false && status !== "groggy") {
                const tLoc = playerLocations.get(tName);
                if (tLoc) {
                  const d = calcDist3D(e.character.loc, tLoc);
                  if (d > 1 && d < minDist) { minDist = d; hDiff = Math.abs(e.character.loc.z - tLoc.z); }
                }
              }
            });

            playerLocations.forEach((loc, name) => {
              const rId = teamMapping.get(name);
              if (rId && rId !== myRosterId && playerAliveStatus.get(name) !== false) {
                const d = calcDist3D(e.character.loc, loc);
                if (d > 1 && d < minEnemyDist) minEnemyDist = d;
              }
            });

            if (minDist !== 999999) {
              totalMinDistSum += minDist;
              totalHeightDiffSum += hDiff;
              const distRatio = minDist / Math.max(500, minEnemyDist); 
              totalIsolationSum += Math.min(5, distRatio);
              isolationSampleCount++;
            }
          }
        }
      }
    }

      if (e._T === "LogPlayerTakeDamage") {
        if (isVehicleDamage) return;
        if (attackerName === lowerNickname && victimName !== lowerNickname) {
          const wId = e.weaponId || "Unknown"; const wStat = weaponStats.get(wId) || { hits: 0, headshots: 0 }; wStat.hits++; if (e.damageReason === "HeadShot") wStat.headshots++; weaponStats.set(wId, wStat);
          const dmg = e.damage || 0;

          let vDmg = victimDamage.get(victimName); if (!vDmg || ts - vDmg.lastTs > 120000) { vDmg = { total: 0, user: 0, lastTs: ts }; }
          vDmg.total += dmg; vDmg.user += dmg; vDmg.lastTs = ts; victimDamage.set(victimName, vDmg);
          combatPressure.totalHits++; combatPressure.uniqueVictims.add(victimName);
          const dist = calcDist3D(e.attacker?.loc, e.victim?.loc); if (dist !== 999 && dist > combatPressure.maxHitDistance) combatPressure.maxHitDistance = Math.round(dist);
          if (["Grenade", "Molotov", "C4"].some(k => (e.damageTypeCategory || "").includes(k))) { combatPressure.utilityDamage += dmg; combatPressure.utilityHits++; }
          
          const timeOffset = (ts - matchStartTime) / 1000 / 60;
          if (timeOffset <= 5) goldenTimeDamage.early += dmg;
          else if (timeOffset <= 15) goldenTimeDamage.mid1 += dmg;
          else if (timeOffset <= 25) goldenTimeDamage.mid2 += dmg;
          else goldenTimeDamage.late += dmg;

          const vRosterId = teamMapping.get(victimName); if (vRosterId && vRosterId !== myRosterId) teamsUserHit.add(vRosterId);
          myDamageEvents.push({ ts, victim: victimName, loc: e.attacker?.loc, victimLoc: e.victim?.loc });
          const lastHit = myRecentDamageTaken.get(victimName); if (lastHit && ts - lastHit < 5000) { const lat = ts - lastHit; reactLatSum += lat; reactCount++; reactionLatencies.push(lat); myRecentDamageTaken.delete(victimName); }
        } else if (victimName === lowerNickname && attackerName && attackerName !== lowerNickname) {
          if (!myRecentDamageTaken.has(attackerName) || ts - myRecentDamageTaken.get(attackerName)! > 5000) { 
            totalTimesHit++; 
            const recentAttackers = recentAttacksOnUser.filter(a => ts - a.ts < 5000).map(a => a.attacker);
            const uniqueAttackers = new Set(recentAttackers);
            if (uniqueAttackers.size >= 2) totalCrossfireCount++;
          }
          myRecentDamageTaken.set(attackerName, ts);
          if (e.damageTypeCategory?.includes("BlueZone")) { 
            const myLoc = playerLocations.get(lowerNickname);
            if (myLoc && lastZoneInfo.radius > 0) { const dTC = Math.sqrt(Math.pow(myLoc.x - lastZoneInfo.x, 2) + Math.pow(myLoc.y - lastZoneInfo.y, 2)); if (Math.abs(dTC - lastZoneInfo.radius) < 50) zoneStrategy.edgePlayCount++; else if (dTC > lastZoneInfo.radius + 100) zoneStrategy.fatalDelayCount++; }
            bluezoneWaste += (e.damage || 0); 
          }
        }
        if (victimName && victimName !== lowerNickname && !teamNames.has(victimName) && attackerName !== lowerNickname) {
          let vDmg = victimDamage.get(victimName); if (!vDmg || ts - vDmg.lastTs > 120000) { vDmg = { total: 0, user: 0, lastTs: ts }; }
          vDmg.total += (e.damage || 0); vDmg.lastTs = ts; victimDamage.set(victimName, vDmg);
        }
      }

      if (["LogPlayerMakeDBNO", "LogPlayerKill", "LogPlayerKillV2", "LogPlayerMakeGroggy"].includes(e._T)) {
        if (attackerName === lowerNickname) myActionTimestamps.push(ts);
        
        [attackerName, victimName].forEach(name => {
          if (name === lowerNickname || eliteNames.has(name)) {
            const pData = playerCombatData.get(name);
            if (pData) {
              const opponent = name === attackerName ? victimName : attackerName;
              const session = pData.sessions.get(opponent);
              if (session) {
                // [V8.2 NEW] Duel Outcome Tracking
                if (!session.outcome) {
                  if (name === attackerName) {
                    session.outcome = "win";
                    pData.duelWins++;
                    if (!session.userStarted) pData.reversalWins++;
                  } else if (name === victimName) {
                    session.outcome = "lose";
                    pData.duelLosses++;
                  }
                }

                // 기존 initiative success 로직 유지
                if (!session.alreadySucceeded && session.userStarted && name === attackerName) {
                  pData.success++;
                  session.alreadySucceeded = true;
                }
              }
            }
          }
        });

        if (victimName && !teamNames.has(victimName)) {
          if (["LogPlayerKill", "LogPlayerKillV2"].includes(e._T)) {
            if (attackerName === lowerNickname) {
              const vDmg = victimDamage.get(victimName);
              if (vDmg) {
                const userRatio = vDmg.user / Math.max(1, vDmg.total);
                if (userRatio >= 0.7) killContribution.solo++; else killContribution.cleanup++;
              } else {
                killContribution.solo++;
              }
            }
            victimDamage.delete(victimName);
            const vRosterId = teamMapping.get(victimName);
            if (vRosterId && vRosterId !== myRosterId) { const members = teamAliveMembers.get(vRosterId); if (members) { members.delete(victimName); if (members.size === 0 && (teamsUserHit.has(vRosterId) || attackerName === lowerNickname)) wipedTeamsByUserParticipation.add(vRosterId); } }
          }
        }
        if (victimName === lowerNickname && ["LogPlayerMakeDBNO", "LogPlayerMakeGroggy"].includes(e._T)) { 
          myDownedIntervals.push({ start: ts, end: null });
        }
        // [V7.4 FIX] Correctly count teammate knockdowns here, not inside LogPlayerTakeDamage block
        if (teamNames.has(victimName) && victimName !== lowerNickname && ["LogPlayerMakeDBNO", "LogPlayerMakeGroggy"].includes(e._T)) {
          totalTeammateKnocks++;
          teammateKnockEvents.push(ts);
        }
        if (victimName === lowerNickname && ["LogPlayerMakeDBNO", "LogPlayerMakeGroggy"].includes(e._T)) {
          const makerName = normalizeName(e.maker?.name || e.dBNOMaker?.name || "");
          if (makerName && makerName !== lowerNickname && !teamNames.has(makerName)) {
            const victimLoc = e.victim?.loc || playerLocations.get(lowerNickname);
            const makerLoc = e.maker?.loc || e.dBNOMaker?.loc || playerLocations.get(makerName);
            
            if (victimLoc && makerLoc) {
              let minTeammateDist = 999999;
              teamNames.forEach(tName => {
                const status = playerAliveStatus.get(tName);
                if (tName !== lowerNickname && status !== false && status !== "groggy") {
                  const tLoc = playerLocations.get(tName);
                  if (tLoc) {
                    let d = calcDist3D(victimLoc, tLoc);
                    // [V11] 단위가 m이므로 5m 차이를 기준으로 수직 고립 판정
                    const teamHDiff = Math.abs(victimLoc.z - tLoc.z);
                    if (teamHDiff > 5) d *= 1.5; 
                    
                    if (d < minTeammateDist) minTeammateDist = d;
                  }
                }
              });

              if (minTeammateDist !== 999999) {
                // [V11] 단위가 m이므로 최소 거리를 50m로 클램핑 (500m는 너무 멀어서 변별력 상실)
                const distToEnemy = Math.max(50, calcDist3D(victimLoc, makerLoc));
                let weaponWeight = 1.0;
                const weapon = (e.damageCauserName || "").toLowerCase();
                if (weapon.includes("kar98k") || weapon.includes("m24") || weapon.includes("awm") || weapon.includes("mosin")) weaponWeight = 1.5;
                else if (weapon.includes("slr") || weapon.includes("sks") || weapon.includes("mk12") || weapon.includes("mini14")) weaponWeight = 1.3;

                const crossfireWeight = totalCrossfireCount > 0 ? 1.4 : 1.0;
                const isolationIdx = (minTeammateDist / distToEnemy) * weaponWeight * crossfireWeight;
                dbnoIsolationSamples.push(Number(isolationIdx.toFixed(2)));
              }
            }
          }
        }
        if (victimName === lowerNickname && ["LogPlayerKill", "LogPlayerKillV2"].includes(e._T)) { const last = myDownedIntervals[myDownedIntervals.length - 1]; if (last && last.end === null) last.end = ts; myDeathTime = e._D; const dDist = calcDist3D(e.victim?.loc, e.attacker?.loc || e.killer?.loc || e.maker?.loc || e.dBNOMaker?.loc || e.finisher?.loc); if (dDist !== 999) deathDistance = Math.round(dDist); playerAliveStatus.set(lowerNickname, false); }
        if (victimName && ["LogPlayerKill", "LogPlayerKillV2"].includes(e._T)) playerAliveStatus.set(victimName, false);
        else if (victimName && ["LogPlayerMakeDBNO", "LogPlayerMakeGroggy"].includes(e._T)) playerAliveStatus.set(victimName, "groggy");
      }
      if (e._T === "LogPlayerTakeDamage" && victimName === lowerNickname && attackerName && attackerName !== lowerNickname && !isVehicleDamage) recentAttacksOnUser.push({ ts, attacker: attackerName });
    });

    // [V8.1] 전술 대응력(Bait/Trade) 정밀 계산
    teammateKnockEvents.forEach(dTs => {
      // 아군이 기절한 시점(dTs) 이후 10초 내에 내가 적을 기절/킬 시킨 이벤트 탐색
      const myTradeAction = telData.find(e => 
        (e._T === "LogPlayerMakeGroggy" || e._T === "LogPlayerKill" || e._T === "LogPlayerKillV2") &&
        normalizeName(e.attacker?.name || e.killer?.name || e.maker?.name || e.dBNOMaker?.name || e.finisher?.name) === lowerNickname &&
        new Date(e._D).getTime() > dTs && 
        new Date(e._D).getTime() < dTs + 10000
      );

      if (myTradeAction) {
        const latency = new Date(myTradeAction._D).getTime() - dTs;
        // [V11] 트레이드 반응 속도 단일 소스로 수집 (중복 변수 제거)
        tradeLatencies.push(latency);
      }
      
      // 단순히 데미지를 주거나 사격한 경우 (Bait) - 트레이드에 성공하지 못한 경우에만 카운트
      if (!myTradeAction && myActionTimestamps.some(ts => ts > dTs && ts <= dTs + 10000)) totalBaitCount++;
    });

    const myStats = myInfo.attributes.stats;
    const totalTeamDamage = teamStats.reduce((acc: number, m: any) => acc + (m.damageDealt || 0), 0);
    const totalTeamKills = teamStats.reduce((acc: number, m: any) => acc + (m.kills || 0), 0);
    const damageImpact = totalTeamDamage > 0 ? Number(((myStats.damageDealt / totalTeamDamage) * 100).toFixed(1)) : 0;
    const killImpact = totalTeamKills > 0 ? Number(((myStats.kills / totalTeamKills) * 100).toFixed(1)) : 0;

    const badges = [];
    if (itemUseSummary.smokes >= 3) badges.push({ id: "smoke_master", name: "인간 연막탄", desc: "한 매치에서 3회 이상 연막 전술 수행" });
    const weaponStatsList = Array.from(weaponStats.entries()).sort((a,b) => b[1].hits - a[1].hits);
    const mainWeapon = weaponStatsList[0];
    if (mainWeapon && mainWeapon[1].hits >= 10 && (mainWeapon[1].headshots / mainWeapon[1].hits) >= 0.25) badges.push({ id: "sharpshooter", name: "정밀 사수", desc: "헤드샷 비중 25% 이상의 정교한 사격" });
    if (zoneStrategy.edgePlayCount >= 2) badges.push({ id: "zone_wizard", name: "자기장의 마술사", desc: "자기장 끝선을 이용한 전략적 운영 2회 이상" });
    if (teamStats.every((m: any) => m.name === myStats.name || m.timeSurvived <= myStats.timeSurvived)) badges.push({ id: "last_survivor", name: "최후의 보루", desc: "팀 내에서 가장 마지막까지 생존하여 교전" });
    if (damageImpact >= 40) badges.push({ id: "damage_carry", name: "팀의 창", desc: "팀 전체 데미지의 40% 이상을 책임짐" });

    const finalResult = {
      matchId, v: RESULT_VERSION, processedAt: new Date().toISOString(), 
      createdAt: matchAttr.createdAt,
      stats: myStats, team: teamStats,
      deathPhase: (() => {
        if (myStats.winPlace === 1) return phaseTimeline.length > 0 ? phaseTimeline[phaseTimeline.length - 1].phase : 9;
        if (!myDeathTime || phaseTimeline.length === 0) return 0;
        const dTs = new Date(myDeathTime).getTime();
        const current = [...phaseTimeline].reverse().find(p => new Date(p.time).getTime() <= dTs);
        return current ? current.phase : 0;
      })(),
      mapName: MAP_NAMES[matchAttr.mapName] || matchAttr.mapName, 
      gameMode: matchAttr.gameMode,
      matchType: matchAttr.matchType,
      totalTeams: rosters.length,
      totalPlayers: participants.length,
      teamImpact: { damageImpact, killImpact, totalTeamDamage, totalTeamKills },
      badges, weaponStats: Object.fromEntries(weaponStats), zoneStrategy,
      goldenTimeDamage, killContribution,
      bluezoneWaste: Math.round(bluezoneWaste),
      isolationData: {
        isolationIndex: dbnoIsolationSamples.length > 0 
          ? Number((dbnoIsolationSamples.reduce((a, b) => a + b, 0) / dbnoIsolationSamples.length).toFixed(2))
          : (isolationSampleCount > 0 ? Number((totalIsolationSum / isolationSampleCount).toFixed(2)) : 0),
        // [V11] 캐시 최적화(1/10 샘플링)로 인해 이동 중 고립도는 다소 부정확할 수 있음 (기절 시점 데이터가 더 정확함)
        minDist: Math.round(totalMinDistSum / Math.max(1, isolationSampleCount)),
        heightDiff: Math.round(totalHeightDiffSum / Math.max(1, isolationSampleCount)),
        isCrossfire: totalCrossfireCount > 0,
        teammateCount: teamStats.length
      },
      tradeStats: { 
          teammateKnocks: totalTeammateKnocks,
          suppCount: totalSuppCount,
          smokeCount: totalSmokeCount,
          revCount: myReviveEvents.length, 
          baitCount: totalBaitCount,
          tradeLatencyMs: tradeLatencies.length > 0 ? Math.round(tradeLatencies.reduce((a,b)=>a+b,0)/tradeLatencies.length) : 0,
          counterLatencyMs: reactCount > 0 ? Math.round(reactLatSum / reactCount) : 0,
          reactionLatencyMs: reactionLatencies.length > 0 ? Math.round(reactionLatencies.reduce((a,b)=>a+b,0) / reactionLatencies.length) : 0,
          coverRate: totalTimesHit > 0 ? Math.round((reactCount / totalTimesHit) * 100) : 0,
          enemyTeamWipes: wipedTeamsByUserParticipation.size 
      },
      initiative_rate: (playerCombatData.get(lowerNickname)?.total > 0) ? Math.round((playerCombatData.get(lowerNickname).success / playerCombatData.get(lowerNickname).total) * 100) : 0,
      duelStats: {
        totalDuels: (playerCombatData.get(lowerNickname)?.duelWins || 0) + (playerCombatData.get(lowerNickname)?.duelLosses || 0),
        wins: playerCombatData.get(lowerNickname)?.duelWins || 0,
        losses: playerCombatData.get(lowerNickname)?.duelLosses || 0,
        reversals: playerCombatData.get(lowerNickname)?.reversalWins || 0,
        duelWinRate: ((playerCombatData.get(lowerNickname)?.duelWins || 0) + (playerCombatData.get(lowerNickname)?.duelLosses || 0)) > 0
          ? Math.round((playerCombatData.get(lowerNickname).duelWins / (playerCombatData.get(lowerNickname).duelWins + playerCombatData.get(lowerNickname).duelLosses)) * 100)
          : 0
      },
      combatPressure: { 
        ...combatPressure, 
        uniqueVictims: Array.from(combatPressure.uniqueVictims), // [V11] Set 직렬화 오류 해결 (Array 변환)
        pressureIndex: Number(((combatPressure.totalHits + combatPressure.utilityHits * 2) / Math.max(1, (myStats.timeSurvived / 60))).toFixed(2)) 
      },
      eliteBenchmark: {
        avgDamage: eliteAvgDamage,
        avgKills: eliteAvgKills,
        avgCounterLatency: eliteAvgCounterLatency,
        avgInitiativeRate: Math.round(calcAvg(elitePool, 'initiative_rate', 55)),
        avgReviveRate: Math.round(calcAvg(elitePool, 'revive_rate', 80)),
        avgSmokeRate: Math.round(calcAvg(elitePool, 'smoke_rate', 60)),
        avgSuppCount: Number(calcAvg(elitePool, 'supp_count', 3).toFixed(1)),
        avgDeathDistance: Math.round(calcAvg(elitePool, 'enemy_death_distance', 30)),
        avgIsolationIndex: Number(calcAvg(elitePool, 'isolation_index', 1.0).toFixed(2)),
        avgPressureIndex: Number(calcAvg(elitePool, 'pressure_index', 3.0).toFixed(2))
      },
      itemUseSummary, deathDistance
    };

    // [V11] 벤치마크 필터링 및 데이터 분리 저장 설계 적용
    const botCount = participants.filter((p: any) => p.attributes.accountId?.startsWith("ai.")).length;
    const totalParticipants = participants.length;
    const isNotBotMatch = totalParticipants > 0 && (botCount / totalParticipants) < 0.3; // 봇 비중 30% 미만
    const isNotTdmOrEvent = !matchAttr.gameMode.includes('tdm') && !matchAttr.gameMode.includes('event') && !matchAttr.gameMode.includes('training');
    
    const damagePercentileInMatch = myDamageRank / Math.max(1, totalParticipants);
    const hasMinSurvival = myStats.timeSurvived >= 600; // 10분 이상 생존
    const hasEngaged = (myStats.kills + myStats.assists) >= 1; // 교전 참여

    const isValidBenchmark = 
      damagePercentileInMatch <= 0.25 && 
      hasMinSurvival && 
      hasEngaged && 
      isNotTdmOrEvent && 
      isNotBotMatch;

    // 1. match_stats_raw: 모든 참가자 전수 수집 (모집단 확보)
    const rawInserts = participants.map((p: any) => ({
        match_id: matchId,
        player_id: normalizeName(p.attributes.stats.name),
        damage: Math.floor(p.attributes.stats.damageDealt),
        kills: p.attributes.stats.kills,
        win_place: p.attributes.stats.winPlace,
        game_mode: matchAttr.gameMode,
        map_name: matchAttr.mapName
    }));

    const backgroundTasks = [];
    
    backgroundTasks.push(
        supabase.from("match_stats_raw").upsert(rawInserts, { onConflict: 'match_id,player_id' })
    );

    // 2. global_benchmarks: 고성과자 전술 지표 수집 (filter_version = 2)
    if (isValidBenchmark || forceBenchmark) {
        const totalKills = (finalResult.killContribution.solo || 0) + (finalResult.killContribution.cleanup || 0);
        backgroundTasks.push(
            supabase.from("global_benchmarks").upsert({
                match_id: matchId,
                player_id: lowerNickname,
                damage: Math.floor(myStats.damageDealt),
                kills: myStats.kills,
                win_place: myStats.winPlace,
                game_mode: matchAttr.gameMode,
                map_name: matchAttr.mapName,
                counter_latency_ms: finalResult.tradeStats.counterLatencyMs,
                initiative_rate: finalResult.initiative_rate,
                revive_rate: totalTeammateKnocks > 0 ? Math.round((myReviveEvents.length / totalTeammateKnocks) * 100) : 0,
                smoke_count: itemUseSummary.smokes,
                frag_count: itemUseSummary.frags,
                pressure_index: finalResult.combatPressure.pressureIndex,
                enemy_death_distance: deathDistance,
                smoke_rate: totalTeammateKnocks > 0 ? Math.round((totalSmokeCount / totalTeammateKnocks) * 100) : 0,
                supp_count: totalSuppCount,
                team_wipes: wipedTeamsByUserParticipation.size,
                utility_count: itemUseSummary.smokes + itemUseSummary.frags,
                survival_time: Math.round(myStats.timeSurvived),
                solo_kill_rate: totalKills > 0 ? Math.round((finalResult.killContribution.solo / totalKills) * 100) : 0,
                burst_damage: finalResult.goldenTimeDamage.early,
                isolation_index: finalResult.isolationData.isolationIndex,
                min_dist: finalResult.isolationData.minDist,
                height_diff: finalResult.isolationData.heightDiff,
                is_crossfire: finalResult.isolationData.isCrossfire,
                death_phase: finalResult.deathPhase,
                filter_version: 2
            }, { onConflict: 'match_id,player_id' })
        );
    }

    backgroundTasks.push(
        supabase.from("processed_match_telemetry").upsert({ 
            match_id: matchId, 
            player_id: lowerNickname, 
            data: { fullResult: finalResult }, 
            updated_at: new Date().toISOString() 
        }, { onConflict: 'match_id,player_id' })
    );

    // [V11] Vercel Serverless 환경에서의 데이터 유실 방지를 위한 병렬 대기
    await Promise.allSettled(backgroundTasks);

    return NextResponse.json(finalResult);
  } catch (error: any) {
    console.error("[MATCH-API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
