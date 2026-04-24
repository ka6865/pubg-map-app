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

    // [DB] V3.0 캐시 체크
    const { data: fullCache } = await supabase.from("processed_match_telemetry").select("data").eq("match_id", matchId).eq("player_id", lowerNickname).single();
    if (fullCache && (fullCache.data as any).fullResult?.v >= 4.9) {
      console.log(`[DB] 4.9 Cache Hit: ${matchId}`);
      return NextResponse.json((fullCache.data as any).fullResult);
    }

    // 상위권 벤치마크용 데이터 로드
    const { data: top15Players } = await supabase.from("global_benchmarks").select("*").order("damage", { ascending: false }).limit(15);
    const realTop15AvgDamage = top15Players?.length ? top15Players.reduce((a, b) => a + b.damage, 0) / top15Players.length : 450;
    const realTop15AvgKills = top15Players?.length ? 3.5 : 3.0;

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
          const types = ["LogMatchStart", "LogPlayerKill", "LogPlayerKillV2", "LogPlayerMakeDBNO", "LogPlayerTakeDamage", "LogItemUse", "LogPlayerRevive"];
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
          // LogPlayerRevive는 데이터 손실 방지를 위해 전체 보존
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
    const top15Names: Set<string> = new Set(top15Players?.map((p: any) => normalizeName(p.player_id)) || []);
    const myAttackEvents: any[] = [], smokeUseEvents: any[] = [], teamSmokeEvents: any[] = [], myDamageEvents: any[] = [], teammateKnockEvents: any[] = [];
    const myActionTimestamps: number[] = [], myReviveEvents: any[] = [], itemUseEvents: string[] = [];
    const myRecentDamageTaken = new Map<string, number>();
    const goldenTimeDamage = { early: 0, mid1: 0, mid2: 0, late: 0 };
    let bzWaste = 0, bzLastTime = 0, bzAccum = 0, reactLatSum = 0, reactCount = 0;
    // 플레이어 생존 상태 추적 (내가 죽었거나 DBNO일 때는 분모 제외)
    let myDeathTime: number | null = null;
    const myDownedIntervals: { start: number; end: number | null }[] = [];

    telData.forEach((e: any) => {
      const ts = new Date(e._D).getTime();
      const elapsed = (ts - matchStartTime) / 1000;
      const attackerName = normalizeName(e.attacker?.name || e.killer?.name || e.maker?.name || e.character?.name || "");
      const victimName = normalizeName(e.victim?.name || "");

      // 1. 주도권 분석
      if (e._T === "LogPlayerTakeDamage" && e.attacker && e.victim && attackerName !== victimName) {
        [attackerName, victimName].forEach(name => {
          if (name === lowerNickname || top15Names.has(name)) {
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
      if (e._T === "LogPlayerAttack" && attackerName === lowerNickname) myAttackEvents.push({ ts, loc: e.attacker?.loc });
      // 연막탄 감지: LogPlayerAttack의 weapon.itemId (연막탄은 LogItemUse가 아닌 LogPlayerAttack으로 기록)
      if (e._T === "LogPlayerAttack" && (e.weaponId || "").toLowerCase().includes("smoke")) {
        if (attackerName === lowerNickname) smokeUseEvents.push({ ts, loc: e.attacker?.loc });
        else if (teamNames.has(attackerName)) teamSmokeEvents.push({ ts, loc: e.attacker?.loc });
      }
      if (e._T === "LogItemUse" && attackerName === lowerNickname) {
        if (e.itemId) { itemUseEvents.push(e.itemId); if (e.itemId.toLowerCase().includes("smoke")) smokeUseEvents.push({ ts, loc: e.character?.loc }); }
      }
      if (e._T === "LogPlayerRevive") {
        const revName = normalizeName(e.reviver?.name || (typeof e.reviver === 'string' ? e.reviver : ""));
        const vicName = normalizeName(e.victim?.name || e.character?.name || (typeof e.victim === 'string' ? e.victim : ""));
        
        // 내가 팀원을 살린 경우
        if (revName === lowerNickname && teamNames.has(vicName)) {
          myReviveEvents.push({ ts, victim: vicName });
        }
        // 내가 부활된 경우
        if (vicName === lowerNickname) {
          const last = myDownedIntervals[myDownedIntervals.length - 1];
          if (last && last.end === null) last.end = ts;
        }
      }

      if (e._T === "LogPlayerTakeDamage") {
        if (attackerName === lowerNickname && victimName !== lowerNickname) {
          const dmg = e.damage || 0;
          if (elapsed <= 300) goldenTimeDamage.early += dmg; else if (elapsed <= 900) goldenTimeDamage.mid1 += dmg; else if (elapsed <= 1500) goldenTimeDamage.mid2 += dmg; else goldenTimeDamage.late += dmg;
          myDamageEvents.push({ ts, victim: victimName, loc: e.attacker?.loc, victimLoc: e.victim?.loc });
          const lastHit = myRecentDamageTaken.get(victimName);
          if (lastHit && ts - lastHit < 5000) { reactLatSum += (ts - lastHit); reactCount++; myRecentDamageTaken.delete(victimName); }
        }
        if (victimName === lowerNickname && attackerName && attackerName !== lowerNickname) {
          myRecentDamageTaken.set(attackerName, ts);
          if (e.damageTypeCategory?.includes("BlueZone")) { bzLastTime = ts; bzAccum += (e.damage || 0); }
        }
      }

      if (e._T === "LogPlayerMakeDBNO" || e._T === "LogPlayerKill" || e._T === "LogPlayerKillV2") {
        if (attackerName === lowerNickname) myActionTimestamps.push(ts);
        if (victimName && !teamNames.has(victimName)) {
          teamNames.forEach((m: string) => {
            const mData = playerCombatData.get(m);
            const session = mData?.sessions.get(victimName);
            if (session?.userStarted && !session.alreadySucceeded) { mData!.success++; session.alreadySucceeded = true; }
          });
        }
        if (teamNames.has(victimName) && victimName !== lowerNickname) {
          if (!teammateKnockEvents.some(tk => tk.victim === victimName && ts - tk.ts < 15000)) {
            teammateKnockEvents.push({ ts, victim: victimName, attacker: attackerName, victimLoc: e.victim?.loc, attackerLoc: e.attacker?.loc || e.killer?.loc || e.maker?.loc });
          }
        }
        // 내가 기절당함 → DBNO 구간 시작
        if (victimName === lowerNickname && e._T === "LogPlayerMakeDBNO") {
          myDownedIntervals.push({ start: ts, end: null });
        }
        // 내가 사망 → 구간 종료 + 사망 시간 기록
        if (victimName === lowerNickname && (e._T === "LogPlayerKill" || e._T === "LogPlayerKillV2")) {
          const last = myDownedIntervals[myDownedIntervals.length - 1];
          if (last && last.end === null) last.end = ts;
          myDeathTime = ts;
        }
      }

      if (e._T === "LogPlayerKill" && victimName === lowerNickname) {
        if (bzAccum >= 30 && ts - bzLastTime < 30000) bzWaste++;
      }
    });

    // 지표 산출
    let tradeLatSum = 0, tradeCount = 0;
    
    // 플레이어 행동 가능 여부 체크 헬퍼
    const isPlayerActionable = (ts: number) => {
      if (myDeathTime && ts >= myDeathTime) return false;
      const isDowned = myDownedIntervals.some(interval => ts >= interval.start && (interval.end === null || ts <= interval.end));
      return !isDowned;
    };

    const tacticalTimeline = teammateKnockEvents.map(tk => {
      const actionable = isPlayerActionable(tk.ts);
      // [BUG FIX] 견제: attack 이벤트 OR damage 이벤트로 확인
      const hasSupp = actionable && (myAttackEvents.some(a => a.ts >= tk.ts - 5000 && a.ts <= tk.ts + 30000)
        || myDamageEvents.some(d => d.ts >= tk.ts - 5000 && d.ts <= tk.ts + 30000));

      // 연막: 팀원 기절 전후 40초 내 연막 사용
      const playerSmk = actionable && smokeUseEvents.some(s => s.ts >= tk.ts - 5000 && s.ts <= tk.ts + 40000);
      const teamSmk = teamSmokeEvents.some(s => s.ts >= tk.ts - 5000 && s.ts <= tk.ts + 40000);
      const hasSmk = playerSmk || teamSmk;
      
      // 부활 판정: 내가 실제로 살렸다면 기절 당시 상태와 무관하게 무조건 기회 및 성공으로 인정 (120초 윈도우)
      const didIRevive = myReviveEvents.some(r => r.victim === tk.victim && r.ts >= tk.ts && r.ts <= tk.ts + 120000);
      const hasRev = didIRevive;
      const isRevOpportunity = actionable || didIRevive; // 내가 살렸으면 기회로 강제 인정
      
      const hit = actionable && myDamageEvents.find(md => md.ts > tk.ts && md.ts < tk.ts + 30000);
      if (hit) { tradeLatSum += (hit.ts - tk.ts); tradeCount++; }
      
      const myLoc = myAttackEvents.find(a => Math.abs(a.ts - tk.ts) < 5000)?.loc || myDamageEvents.find(d => Math.abs(d.ts - tk.ts) < 5000)?.loc;
      const dToEnemy = calcDist3D(myLoc, tk.attackerLoc);
      const dToTeammate = calcDist3D(myLoc, tk.victimLoc);
      const isDangerous = dToEnemy <= 150 || dToEnemy > 900;
      return { victim: tk.victim, ts: tk.ts, isActionable: actionable, isRevOpportunity, distUserToTeammate: dToTeammate, distUserToEnemy: dToEnemy, heightDiff: myLoc && tk.victimLoc ? (myLoc.z - tk.victimLoc.z)/100 : 0, hasSuppression: hasSupp, hasSmoke: hasSmk, hasPlayerSmoke: playerSmk, hasTeamSmoke: teamSmk, isDangerous, hasRevive: hasRev };
    });

    // 컨텍스트 필터링 지표 계산 (플레이어가 행동 가능했던 상황만 분모로 사용)
    const actionableTimeline = tacticalTimeline.filter((t: any) => t.isActionable);
    
    // 최종 카운트 산출
    const teammateKnocks = tacticalTimeline.filter((t: any) => t.isRevOpportunity).length;
    const dangerousKnocks = actionableTimeline.filter((t: any) => t.isDangerous).length;
    const suppCount = actionableTimeline.filter((t: any) => t.hasSuppression).length;
    const smokeOpps = dangerousKnocks;
    const smokeCount = actionableTimeline.filter((t: any) => t.isDangerous && t.hasPlayerSmoke).length;
    const teamSmokeCovered = actionableTimeline.filter((t: any) => t.isDangerous && t.hasTeamSmoke && !t.hasPlayerSmoke).length;
    
    // 부활 성공 횟수: 경기 전체에서 내가 팀원을 살린 횟수 (누락 방지를 위해 전체 합산 사용)
    const revCount = myReviveEvents.length;

    // 복수/미끼 (Bait) 로직: 내가 살아있을 때 죽은 팀원에 대해서만 기회 부여
    let baitCount = 0;
    const teamDeaths = telData.filter(e => (e._T === "LogPlayerKill" || e._T === "LogPlayerKillV2") && teamNames.has(normalizeName(e.victim?.name))).map(e => new Date(e._D).getTime());
    teamDeaths.forEach(dTs => { 
      if (isPlayerActionable(dTs)) {
        if (myActionTimestamps.filter(ts => ts > dTs && ts <= dTs + 10000).length >= 2) baitCount++; 
      }
    });

    const myCombatData = playerCombatData.get(lowerNickname) || { total: 0, success: 0 };
    const finalResult = {
      matchId, v: 4.9, processedAt: new Date().toISOString(), stats: myInfo.attributes.stats, team: teamStats,

      mapName: MAP_NAMES[matchAttr.mapName] || matchAttr.mapName,
      gameMode: matchAttr.gameMode,
      createdAt: matchAttr.createdAt,
      tradeStats: {
        // 행동 가능한 전체 기절 (= 모든 지표 공통 분모)
        teammateKnocks,
        // 위험 상황 횟수 (= 견제 분모)
        dangerousKnocks,
        // 연막 필요 상황 (= 위험상황)
        smokeOpps,
        // 실제 행동 카운트
        suppCount,
        smokeCount,
        teamSmokeCovered,
        revCount, // actionableRevCount
        baitCount,
        backupLatencyMs: tradeCount > 0 ? Math.round(tradeLatSum / tradeCount) : 0,
        reactionLatencyMs: reactCount > 0 ? Math.round(reactLatSum / reactCount) : 0,
        coverRate: teammateKnockEvents.length > 0 ? Math.round((tradeCount / teammateKnockEvents.length) * 100) : 0
      },
      tacticalTimeline,
      initiativeStats: { total: myCombatData.total, success: myCombatData.success, rate: myCombatData.total > 0 ? Math.round((myCombatData.success / myCombatData.total) * 100) : 0 },
      goldenTimeDamage, bluezoneWasteCount: bzWaste,
      top10Baseline: { avgDamage: realTop15AvgDamage, avgKills: realTop15AvgKills, realTradeLatency: 1800, realInitiativeSuccess: 55, realDeathDistance: 30 }
    };

    supabase.from("processed_match_telemetry").upsert({ match_id: matchId, player_id: lowerNickname, data: { fullResult: finalResult }, updated_at: new Date().toISOString() }, { onConflict: 'match_id,player_id' }).then();

    return NextResponse.json(finalResult);
  } catch (error: any) {
    console.error("[MATCH-API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
