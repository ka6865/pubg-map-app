import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache"; // [ISR V1.0] Next.js 16 캐싱 API
import { AnalysisEngine } from "@/lib/pubg-analysis/AnalysisEngine";
import { getBaseTier } from "@/lib/pubg-analysis/benchmarkScore";
import { RESULT_VERSION, TELEMETRY_VERSION } from "@/lib/pubg-analysis/constants";
import { normalizeName } from "@/lib/pubg-analysis/utils";
import { adaptBenchmark } from "@/lib/pubg-analysis/benchmarkAdapter";
import { uploadToR2, downloadFromR2 } from "@/lib/pubg-analysis/r2Service";

// [ISR V1.0] force-dynamic 유지: PUBG API 호출, R2 업로드, DB Upsert 등 부수효과 보호
// unstable_cache는 DB 읽기(캐시 조회) 전용 프록시로만 사용
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

/**
 * [ISR V1.0] Supabase DB 조회를 Next.js 16 unstable_cache로 래핑
 * - Cache Hit 시: DB 커넥션 0건, 메모리/Edge 캐시에서 즉시 반환
 * - Cache Miss 시: DB 1회 조회 후 결과를 캐시에 자동 적재
 * - revalidateTag('match-analysis') 호출 시: 모든 캐시 엔트리 즉각 만료
 */
const getCachedMatchTelemetry = unstable_cache(
  async (matchId: string, lowerNickname: string) => {
    console.log(`[NEXT-CACHE-MISS] Supabase DB 직접 조회 기동: ${matchId}/${lowerNickname}`);
    const { data: cachedResult, error } = await supabase
      .from("processed_match_telemetry")
      .select("data")
      .eq("match_id", matchId)
      .eq("player_id", lowerNickname)
      .maybeSingle();

    if (error) {
      console.error(`[NEXT-CACHE-MISS] DB 조회 오류:`, error.message);
      return null;
    }
    return cachedResult?.data || null;
  },
  ["match-telemetry"], // 캐시 네임스페이스 키
  {
    tags: ["match-analysis"], // revalidateTag('match-analysis')로 무효화
    revalidate: 604800 // 7일간 캐시 보존 (배포 시 revalidateTag로 즉시 소각)
  }
);

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

  // [MOCK] 로컬 DB 장애 및 시뮬레이션을 위한 골드 매치 모킹
  if (matchId === "match-gold-simulation-1234") {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const filePath = path.join(process.cwd(), "scratch", "mock_gold_match_data.json");
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, "utf-8");
        return NextResponse.json(JSON.parse(data));
      }
    } catch (e) {
      console.error("[MOCK-ERROR]", e);
    }
  }

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

    // [ISR V1.0] unstable_cache 프록시를 통한 DB 캐시 조회
    // Cache Hit: DB 커넥션 0건으로 즉시 반환 (Supabase 무료 플랜 커넥션 절약)
    // Cache Miss: DB 1회 조회 후 Next.js Edge 캐시에 자동 적재
    const cachedData = await getCachedMatchTelemetry(matchId, lowerNickname) as any;

    // [ISR V1.0] RESULT_VERSION 비교 제거 — 캐시가 존재하면 최신으로 인정
    // 캐시 무효화는 revalidateTag('match-analysis')가 전담 (수동 버전 범핑 소각)
    if (cachedData?.fullResult) {
      return NextResponse.json(cachedData.fullResult);
    }

    const telemetryAsset = matchData.included.find((it: any) => it.type === "asset");
    let telData: any[] = [];

    if (telemetryAsset) {
      const analyzePath = `${matchId}_${lowerNickname}_v${TELEMETRY_VERSION}_analyze.json`;
      const fileText = await downloadFromR2(analyzePath);

      let needsProcessing = !fileText;
      if (fileText) {
        const parsed = JSON.parse(fileText);
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

          // [V58.4] LogMatchEnd 이벤트의 고정밀 무기 스탯 및 캐릭터 필드 보존
          if (e._T === "LogMatchEnd") {
            if (e.allWeaponStats !== undefined) slim.allWeaponStats = e.allWeaponStats;
            if (e.characters !== undefined) slim.characters = e.characters;
          }

          return slim;
        });

        // [V58.3] telemetry 저장은 하되, Cloudflare R2로 무부하 저장
        await uploadToR2(analyzePath, JSON.stringify(telData), 'application/json');
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
      // 1. 리플레이용 대용량 데이터는 Cloudflare R2로 (DB 부하 영구 제거)
      uploadToR2(mapCachePath, JSON.stringify(mapData), 'application/json'),
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
        telemetry_version: TELEMETRY_VERSION,
        storage_path: mapCachePath // [V58.3] 스마트 클린업 연동용 도킹 열쇠 컬럼!
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
