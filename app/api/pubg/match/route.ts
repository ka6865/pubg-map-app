import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AnalysisEngine } from "@/lib/pubg-analysis/AnalysisEngine";
import { getBaseTier } from "@/lib/pubg-analysis/benchmarkScore";
import { RESULT_VERSION, TELEMETRY_VERSION } from "@/lib/pubg-analysis/constants";
import { normalizeName } from "@/lib/pubg-analysis/utils";
import { adaptBenchmark } from "@/lib/pubg-analysis/benchmarkAdapter";

// [V41.7] 2026 Next.js 16 Premium Configuration
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAP_NAMES: Record<string, string> = {
  "Baltic_Main": "에란겔", "Savage_Main": "사녹", "Desert_Main": "미라마",
  "Summerland_Main": "카라킨", "Chimera_Main": "파라모", "Tiger_Main": "태이고",
  "Kiki_Main": "데스턴", "Neon_Main": "론도", "DihorOtok_Main": "비켄디"
};

const MAP_IDS: Record<string, string> = {
  "Baltic_Main": "erangel", "Savage_Main": "sanhok", "Desert_Main": "miramar",
  "Summerland_Main": "karakin", "Chimera_Main": "paramo", "Tiger_Main": "taego",
  "Kiki_Main": "deston", "Neon_Main": "rondo", "DihorOtok_Main": "vikendi"
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const matchId = searchParams.get("matchId");
  const nickname = searchParams.get("nickname");
  const platform = searchParams.get("platform") || "steam";
  const lowerNickname = normalizeName(nickname || "");

  if (!matchId || !nickname) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  try {
    const apiKey = (process.env.PUBG_API_KEY || "").split(" ")[0];
    const res = await fetch(`https://api.pubg.com/shards/${platform}/matches/${matchId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/vnd.api+json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) throw new Error(`PUBG API Match Load Failed: ${res.status}`);
    const matchData = await res.json();
    const matchAttr = matchData.data.attributes;

    const participants = matchData.included.filter((it: any) => it.type === "participant");
    const rosters = matchData.included.filter((it: any) => it.type === "roster");

    const myParticipant = participants.find((p: any) => normalizeName(p.attributes.stats.name) === lowerNickname);
    if (!myParticipant) throw new Error(`Player ${nickname} not found in match participants`);

    const myAccountId = myParticipant.attributes.stats.playerId || myParticipant.attributes.accountId;

    // [V55.0] 닉네임 캐시 최적화: 분석 대상 플레이어 1명만 즉시 업데이트 (데드락 방지)
    const myCacheEntry = {
      id: myAccountId,
      platform,
      nickname: myParticipant.attributes.stats.name,
      lower_nickname: myParticipant.attributes.stats.name.toLowerCase(),
      updated_at: new Date().toISOString()
    };

    supabase.from('pubg_player_cache').upsert(myCacheEntry, { onConflict: 'id' })
      .then(({ error }) => {
        if (error) console.warn('[CACHE-UPDATE-ERROR]', error.message);
      });
    const myRoster = rosters.find((r: any) => r.relationships.participants.data.some((p: any) => p.id === myParticipant.id));
    const myRosterId = myRoster?.id || "";

    const teamStats = myRoster 
      ? myRoster.relationships.participants.data.map((pRef: any) => participants.find((p: any) => p.id === pRef.id)?.attributes.stats).filter(Boolean)
      : [myParticipant.attributes.stats];

    const teamNames = new Set<string>(teamStats.map((m: any) => normalizeName(m.name)));
    const teamAccountIds = new Set<string>(teamStats.map((m: any) => (m.playerId || m.accountId) as string).filter(Boolean));

    const humanParticipants = participants.filter((p: any) => !p.attributes.accountId?.startsWith("ai."));
    const sortedByDamage = [...humanParticipants].map(p => p.attributes.stats).sort((a, b) => b.damageDealt - a.damageDealt);
    const myDamageRank = sortedByDamage.findIndex((s: any) => normalizeName(s.name) === lowerNickname) + 1;
    const rankPct = humanParticipants.length > 0 ? myDamageRank / humanParticipants.length : 1;

    // 1. 캐시 무결성 검사 (타입 가드 강화)
    const { data: cachedResult } = await supabase
      .from("processed_match_telemetry")
      .select("data")
      .eq("match_id", matchId)
      .eq("player_id", lowerNickname)
      .maybeSingle();

    const cachedData = cachedResult?.data as any;
    if (cachedData?.fullResult && cachedData.fullResult.v >= RESULT_VERSION) {
      return NextResponse.json(cachedData.fullResult);
    }

    const telemetryAsset = matchData.included.find((it: any) => it.type === "asset");
    let telData: any[] = [];

    if (telemetryAsset) {
      const analyzePath = `${matchId}_${lowerNickname}_v${TELEMETRY_VERSION}_analyze.json`;
      const { data: fileData, error: downloadError } = await supabase.storage.from('telemetry').download(analyzePath);

      let needsProcessing = !fileData || downloadError;
      if (fileData) {
        const parsed = JSON.parse(await fileData.text());
        const isHealthy = parsed.length > 0 && parsed.some((ev: any) => ev.attacker?.accountId || ev.victim?.accountId);
        if (isHealthy) {
          telData = parsed;
        } else {
          needsProcessing = true;
        }
      }

      if (needsProcessing) {
        const telRes = await fetch(telemetryAsset.attributes.URL);
        const rawTel = await telRes.json();


        let posCount = 0;
        telData = rawTel.filter((e: any) => {
          if (e._T === "LogPlayerPosition") {
            const pName = normalizeName(e.character?.name || "");
            if (teamNames.has(pName)) return true;
            return (++posCount) % 10 === 0;
          }
          return [
            "LogMatchStart", "LogPlayerCreate", "LogPlayerKill", "LogPlayerKillV2",
            "LogPlayerMakeGroggy", "LogPlayerRevive", "LogPlayerRecall",
            "LogPlayerRecallShip", "LogPlayerRedeploy", "LogPlayerRedeployBRStart",
            "LogPlayerTakeDamage", "LogItemUse", "LogPlayerUseThrowable",
            "LogThrowableUse", "LogProjectileHit", "LogGameStatePeriodic",
            "LogPhaseChange", "LogParachuteLanding", "LogMatchEnd"
          ].includes(e._T);
        }).map((e: any) => {
          const slim: any = { _T: e._T, _D: e._D };
          const normLoc = (loc: any) => {
            if (!loc) return null;
            const res = { x: Math.round(loc.x), y: Math.round(loc.y), z: Math.round(loc.z || 0) };
            if (e._T === "LogPlayerPosition" && Math.abs(res.x) < 10000 && Math.abs(res.x) > 0) {
              // Valid small coordinate case
            }
            return res;
          };

          if (e._T === "LogGameStatePeriodic") {
            const gs = e.gameState;
            slim.gameState = {
              safetyZonePosition: normLoc(gs.safetyZonePosition),
              safetyZoneRadius: Math.round(gs.safetyZoneRadius),
              poisonGasWarningPosition: normLoc(gs.poisonGasWarningPosition),
              poisonGasWarningRadius: gs.poisonGasWarningRadius != null ? Math.round(gs.poisonGasWarningRadius) : null
            };
            return slim;
          }

          const actors = ["attacker", "victim", "killer", "maker", "dBNOMaker", "finisher", "character", "recaller", "reviver", "item", "recallingPlayer", "recalledPlayer"];
          actors.forEach(key => {
            if (e[key]) {
              const char = e[key];
              slim[key] = {
                name: (typeof char === 'string' ? char : (char.name || char.characterName || char.itemId)),
                accountId: char.accountId || char.playerId,
                teamId: char.teamId,
                location: normLoc(char.location),
                vehicle: char.vehicle // [V16.0] 탈것 숙련도 계산을 위해 차량 정보 유지
              };
            }
          });

          if (e.recalledPlayers && Array.isArray(e.recalledPlayers)) {
            slim.recalledPlayers = e.recalledPlayers.map((p: any) => ({
              name: p.name || p.characterName,
              accountId: p.accountId || p.playerId,
              teamId: p.teamId,
              location: normLoc(p.location)
            }));
          }

          const keepFields = ["damage", "damageReason", "damageTypeCategory", "damageCauserName", "damageCauser", "distance", "weapon", "weaponId", "dBNOId", "phase", "isGame", "attackId", "killerDamageInfo", "finishDamageInfo", "dBNODamageInfo", "reviveType", "vehicle"];
          keepFields.forEach(f => { if (e[f] !== undefined) slim[f] = e[f]; });

          // [V58.0] 페이즈 추적을 위한 common.isGame 필드 보존
          if (e.common?.isGame !== undefined) slim.common = { isGame: e.common.isGame };
          else if (e.Common?.IsGame !== undefined) slim.Common = { IsGame: e.Common.IsGame };

          return slim;
        });

        // [V55.0] telemetry 저장은 하되, master 레코드는 마지막에 한 번만 통합 업데이트
        await supabase.storage.from('telemetry').upload(analyzePath, JSON.stringify(telData), { contentType: 'application/json', upsert: true });
      }
    }

    // 2. 매치 컨텍스트 티어 판정 (순위 백분율 기반)
    const getMatchTier = (pct: number) => {
      if (pct <= 0.1) return 'S';
      if (pct <= 0.3) return 'A';
      if (pct <= 0.6) return 'B';
      return 'C';
    };
    const matchTier = getMatchTier(rankPct);

    // 3. 벤치마크 통계 조회
    const { data: tierStats } = await supabase
      .from('benchmark_stats_by_tier')
      .select('*')
      .eq('game_mode', matchAttr.gameMode)
      .eq('tier', getBaseTier(matchTier))
      .maybeSingle();

    const bench = adaptBenchmark(tierStats);

    const engine = new AnalysisEngine(
      nickname, myAccountId, teamNames, teamAccountIds,
      new Set<string>(), new Set<string>(),
      myRosterId
    );

    const result = engine.run(
      telData,
      matchAttr,
      rosters,
      participants,
      myParticipant.attributes.stats,
      teamStats,
      bench
    );

    const defaultBenchmark = {
      avg_damage: 200,
      breakdown: {
        combat: 20,
        tactical: 20,
        survival: 20
      }
    };

    const fullResult = {
      ...result,
      v: RESULT_VERSION,
      matchId,
      player_id: lowerNickname,
      platform,
      matchInfo: {
        map: MAP_NAMES[matchAttr.mapId] || matchAttr.mapId,
        mapId: MAP_IDS[matchAttr.mapId] || 'erangel', // [V47.0] UI 맵 이미지 매핑용 ID 변환
        date: matchAttr.createdAt,
        mode: matchAttr.gameMode,
        duration: matchAttr.duration,
        rankPct,
        tier: matchTier
      },
      benchmark: {
        ...defaultBenchmark,
        ...bench,
        ...(result.benchmark || {})
      }
    };

    // [V26.0] 지도 리플레이 데이터 분리 및 스토리지 저장
    const { mapData, ...tacticalResult } = fullResult;
    const mapCachePath = `${matchId}_${lowerNickname}_v${TELEMETRY_VERSION}_map.json`;
    
    await Promise.all([
      // 1. 리플레이용 대용량 데이터는 스토리지로 (DB 부하 방지)
      supabase.storage.from('telemetry').upload(mapCachePath, JSON.stringify(mapData), {
        contentType: 'application/json',
        upsert: true
      }),
      // 2. 전술 통계, 요약 데이터 및 마스터 레코드 통합 저장 (Transaction 최적화)
      supabase.from("processed_match_telemetry").upsert({
        match_id: matchId,
        player_id: lowerNickname,
        data: { fullResult: tacticalResult },
        updated_at: new Date().toISOString()
      }),
      supabase.from("match_master_telemetry").upsert({
        match_id: matchId,
        map_name: matchAttr.mapId,
        game_mode: matchAttr.gameMode,
        telemetry_version: TELEMETRY_VERSION
      }, { onConflict: 'match_id' })
    ]);

    // 벤치마크 데이터 DB 저장을 위한 Ingest 트리거 (배경 실행)
    // [V26.0] telData는 이미 Storage에 저장되었으므로 payload에서 제외하여 대역폭 및 메모리 절약
    fetch(`${new URL(request.url).origin}/api/pubg/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        matchId, 
        playerNickname: lowerNickname, 
        finalResult: tacticalResult, // tacticalResult만 전달
        matchAttr,
        rawParticipants: participants 
      })
    }).catch(e => console.error("[MATCH-API] Ingest trigger failed:", e));

    // [V56.1] 샘플링을 위한 무작위 참가자 추출 (엘리트 외 일반 데이터 확보용)
    const allParticipantNames = participants
      .filter((p: any) => !p.attributes.stats.playerId?.startsWith("ai."))
      .map((p: any) => p.attributes.stats.name)
      .filter((name: string) => normalizeName(name) !== lowerNickname);

    const sampleParticipants = allParticipantNames
      .sort(() => 0.5 - Math.random())
      .slice(0, 5);

    const finalResponse = {
      ...fullResult,
      sampleParticipants
    };

    return NextResponse.json(finalResponse);

  } catch (err: any) {
    console.error(`[CRITICAL-FAILURE]`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
