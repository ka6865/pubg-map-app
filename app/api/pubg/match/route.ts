import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AnalysisEngine } from "@/lib/pubg-analysis/processor";
import { RESULT_VERSION } from "@/lib/pubg-analysis/constants";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAP_NAMES: Record<string, string> = {
  "Baltic_Main": "에란겔", "Savage_Main": "사녹", "Desert_Main": "미라마",
  "Summerland_Main": "카라킨", "Chimera_Main": "파라모", "Tiger_Main": "태이고",
  "Kiki_Main": "데스턴", "Neon_Main": "론도", "DihorOtok_Main": "비켄디"
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

    // [V11.7] 최신 엔진 버전으로 동기화 (미끼/섬광탄/반격 로직 완성본)
    const { data: cached } = await supabase.from("processed_match_telemetry").select("data, updated_at").eq("match_id", matchId).eq("player_id", lowerNickname).single();
    if (cached && (cached as any).data?.fullResult?.v >= RESULT_VERSION) {
        return NextResponse.json((cached as any).data.fullResult);
    }

    const isFpp = matchAttr.gameMode.includes('fpp');
    const isSquad = matchAttr.gameMode.includes('squad');
    
    // 벤치마크 전체 조회 (최신 순)
    let eliteQuery = supabase.from("global_benchmarks").select("*");
    if (isFpp) eliteQuery = eliteQuery.ilike('game_mode', '%fpp%');
    else eliteQuery = eliteQuery.not('game_mode', 'ilike', '%fpp%');
    
    if (isSquad) eliteQuery = eliteQuery.ilike('game_mode', '%squad%');
    else eliteQuery = eliteQuery.not('game_mode', 'ilike', '%squad%');

    const { data: elitePoolRaw } = await eliteQuery.order('created_at', { ascending: false }).limit(200);
    let elitePool = elitePoolRaw || [];

    // 샘플이 부족할 경우 대비 (현재는 전체 조회만 수행)
    if (elitePool.length < 10) {
      // 신규 데이터가 쌓일 때까지는 기본값을 사용하거나 대기
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
      const { data: masterCache } = await supabase.from("match_master_telemetry").select("telemetry_events, telemetry_version, storage_path").eq("match_id", matchId).single();
      if (masterCache && (masterCache as any).telemetry_version >= TELEMETRY_VERSION) {
        const analyzePath = `${matchId}_analyze.json`;
        // 스토리지에서 분석 전용 캐시 확인
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('telemetry')
          .download(analyzePath);
        
        if (!downloadError && fileData) {
          const text = await fileData.text();
          telData = JSON.parse(text);
        } else {
          telData = (masterCache as any).telemetry_events;
        }
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
          // ✅ 공식 PUBG API 기준: safetyZone = White(안전구역), poisonGasWarning = Blue(자기장)
          // ✅ null 안전성: 게임 초반 poisonGasWarning 필드가 없을 수 있으므로 옵셔널 처리
          if (e._T === "LogGameStatePeriodic") {
            const gs = e.gameState;
            return { 
              _T: e._T, _D: e._D, 
              gameState: { 
                safetyZonePosition: gs.safetyZonePosition 
                  ? { x: Math.round(gs.safetyZonePosition.x / 100), y: Math.round(gs.safetyZonePosition.y / 100) } 
                  : null,
                safetyZoneRadius: gs.safetyZoneRadius != null ? Math.round(gs.safetyZoneRadius / 100) : null,
                poisonGasWarningPosition: gs.poisonGasWarningPosition 
                  ? { x: Math.round(gs.poisonGasWarningPosition.x / 100), y: Math.round(gs.poisonGasWarningPosition.y / 100) } 
                  : null,
                poisonGasWarningRadius: gs.poisonGasWarningRadius != null ? Math.round(gs.poisonGasWarningRadius / 100) : null
              } 
            };
          }
          
          const slim: any = { _T: e._T, _D: e._D };
          if (e.dBNOId !== undefined) slim.dBNOId = e.dBNOId; // [V11.3] dBNOId 보존
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
          if (e.attackId !== undefined) slim.attackId = e.attackId;
          const wId = e.weapon?.itemId || e.weaponId || e.explosiveId || e.itemId || e.damageCauserName;
          if (wId) slim.weaponId = wId;
          return slim;
        });
        // [V11] Master Cache 저장 시 DB 용량 확보를 위해 Storage 활용
        const fileName = `${matchId}_analyze.json`; // 분석용 접미사 추가
        const { error: uploadError } = await supabase.storage
          .from('telemetry')
          .upload(fileName, JSON.stringify(telData), {
            contentType: 'application/json',
            upsert: true
          });

        if (uploadError) {
          console.error("[MATCH-API] Storage Upload Error:", uploadError);
        }

        await supabase.from("match_master_telemetry").upsert({ 
          match_id: matchId, 
          map_name: matchAttr.mapName, 
          game_mode: matchAttr.gameMode, 
          telemetry_events: [], // DB 용량 확보를 위해 본문은 비움
          storage_path: fileName,
          telemetry_version: TELEMETRY_VERSION 
        });
      }
    }

    // [V11.3] 신규 엔진 호출
    const eliteNames = new Set(elitePool.map(p => normalizeName(p.player_id)));
    const myStats = myInfo.attributes.stats;
    const myRosterId = rosters.find((r: any) => r.relationships.participants.data.some((p: any) => p.id === myInfo.id))?.id;
    
    const engine = new AnalysisEngine(nickname, teamNames, eliteNames, myRosterId || "");
    const eliteBenchmarks = {
      avgDamage: eliteAvgDamage,
      avgKills: eliteAvgKills,
      avgCounterLatency: eliteAvgCounterLatency,
      avgInitiativeRate: Math.round(calcAvg(elitePool, 'initiative_rate', 55)),
      avgReviveRate: Math.round(calcAvg(elitePool, 'revive_rate', 80)),
      avgSmokeRate: Math.round(calcAvg(elitePool, 'smoke_rate', 60)),
      avgSuppCount: Number(calcAvg(elitePool, 'supp_count', 3).toFixed(1)),
      avgDeathDistance: Math.round(calcAvg(elitePool, 'enemy_death_distance', 30)),
      avgIsolationIndex: Number(calcAvg(elitePool, 'isolation_index', 1.0).toFixed(2)),
      avgPressureIndex: Number(calcAvg(elitePool, 'pressure_index', 3.0).toFixed(2)),
      avgDeathPhase: Number(calcAvg(elitePool, 'death_phase', 6).toFixed(1))
    };

    const finalResult = engine.run(telData, matchAttr, rosters, participants, myStats, teamStats, eliteBenchmarks);

    // [V11.3] 데이터 수집 및 벤치마크 저장
    const botCount = participants.filter((p: any) => p.attributes.accountId?.startsWith("ai.")).length;
    const isNotBotMatch = participants.length > 0 && (botCount / participants.length) < 0.3;
    const isNotTdmOrEvent = !matchAttr.gameMode.includes('tdm') && !matchAttr.gameMode.includes('event') && !matchAttr.gameMode.includes('training');
    const isValidBenchmark = (myDamageRank / Math.max(1, participants.length)) <= 0.25 && myStats.timeSurvived >= 600 && isNotTdmOrEvent && isNotBotMatch;

    const backgroundTasks = [
      supabase.from("match_stats_raw").upsert(participants.map((p: any) => ({
        match_id: matchId, player_id: normalizeName(p.attributes.stats.name),
        damage: Math.floor(p.attributes.stats.damageDealt), kills: p.attributes.stats.kills,
        win_place: p.attributes.stats.winPlace, game_mode: matchAttr.gameMode, map_name: matchAttr.mapName
      })), { onConflict: 'match_id,player_id' }),
      supabase.from("processed_match_telemetry").upsert({ 
        match_id: matchId, player_id: lowerNickname, data: { fullResult: finalResult }, updated_at: new Date().toISOString() 
      }, { onConflict: 'match_id,player_id' })
    ];

    if (isValidBenchmark || forceBenchmark) {
      const totalKills = (finalResult.killContribution.solo || 0) + (finalResult.killContribution.cleanup || 0);
      backgroundTasks.push(supabase.from("global_benchmarks").upsert({
        match_id: matchId, player_id: lowerNickname, 
        damage: Math.floor(myStats.damageDealt), kills: myStats.kills,
        win_place: myStats.winPlace, game_mode: matchAttr.gameMode, map_name: matchAttr.mapName,
        counter_latency_ms: finalResult.tradeStats.counterLatencyMs, initiative_rate: finalResult.initiative_rate,
        revive_rate: finalResult.tradeStats.teammateKnocks > 0 ? Math.round((finalResult.tradeStats.revCount / finalResult.tradeStats.teammateKnocks) * 100) : 0,
        smoke_count: finalResult.itemUseSummary.smokes, frag_count: finalResult.itemUseSummary.frags,
        pressure_index: finalResult.combatPressure.pressureIndex, enemy_death_distance: finalResult.deathDistance,
        smoke_rate: finalResult.tradeStats.teammateKnocks > 0 ? Math.round((finalResult.tradeStats.smokeCount / finalResult.tradeStats.teammateKnocks) * 100) : 0,
        supp_count: finalResult.tradeStats.suppCount, team_wipes: finalResult.tradeStats.enemyTeamWipes,
        utility_count: finalResult.itemUseSummary.smokes + finalResult.itemUseSummary.frags, survival_time: Math.round(myStats.timeSurvived),
        solo_kill_rate: totalKills > 0 ? Math.round((finalResult.killContribution.solo / totalKills) * 100) : 0,
        burst_damage: finalResult.goldenTimeDamage.early, isolation_index: finalResult.isolationData.isolationIndex,
        min_dist: finalResult.isolationData.minDist, height_diff: finalResult.isolationData.heightDiff,
        is_crossfire: finalResult.isolationData.isCrossfire, death_phase: finalResult.deathPhase,
        trade_rate: finalResult.tradeStats.teammateKnocks > 0 ? Math.round((finalResult.tradeStats.tradeKills / finalResult.tradeStats.teammateKnocks) * 100) : 0
      }, { onConflict: 'match_id,player_id' }));
    }

    await Promise.allSettled(backgroundTasks);

    return NextResponse.json(finalResult);
  } catch (error: any) {
    console.error("[MATCH-API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
