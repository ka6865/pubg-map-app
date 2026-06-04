import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache"; // [ISR V1.0] Next.js 16 캐싱 API
import { AnalysisEngine } from "@/lib/pubg-analysis/AnalysisEngine";
import { getBaseTier } from "@/lib/pubg-analysis/benchmarkScore";
import { RESULT_VERSION, TELEMETRY_VERSION } from "@/lib/pubg-analysis/constants";
import { normalizeName } from "@/lib/pubg-analysis/utils";
import { adaptBenchmark } from "@/lib/pubg-analysis/benchmarkAdapter";
import { uploadToR2, downloadFromR2 } from "@/lib/pubg-analysis/r2Service";
import { trackPubgRateLimit } from "@/lib/pubg-analysis/pubgApiTracker";
import { reportPubgApiError } from "@/lib/pubg/apiHelper";

// [ISR V1.0] force-dynamic 유지: PUBG API 호출, R2 업로드, DB Upsert 등 부수효과 보호
// unstable_cache는 DB 읽기(캐시 조회) 전용 프록시로만 사용
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function safeJsonParse(res: Response): Promise<any> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("json")) {
    throw new Error(`PUBG API 응답이 JSON 형식이 아닙니다 (Content-Type: ${contentType}, Status: ${res.status}). API 호출 한도 초과 또는 일시적인 장애일 수 있습니다.`);
  }
  try {
    return await res.json();
  } catch (err: any) {
    throw new Error(`JSON 파싱 실패: ${err.message}`);
  }
}

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
  const force = searchParams.get("force") === "true";
  const secret = searchParams.get("secret");
  const source = searchParams.get("source") || "user"; // 'user' | 'scraper'

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
    trackPubgRateLimit(res.headers);

    if (!res.ok) {
      if (res.status === 429) {
        return NextResponse.json(
          { error: "PUBG API 호출 한도가 일시적으로 초과되었습니다. 약 1분 후 다시 시도해 주세요." },
          { status: 429 }
        );
      }
      throw new Error(`PUBG API Match Load Failed: ${res.status}`);
    }
    const matchData = await safeJsonParse(res);
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

    // 보안 검증된 어드민만 forceUpdate 활성화
    const isAdmin = secret === process.env.ADMIN_REVALIDATE_TOKEN;
    const shouldForce = force && isAdmin;

    // [ISR V1.0] unstable_cache 프록시를 통한 DB 캐시 조회
    let cachedData = null;
    if (!shouldForce) {
      cachedData = await getCachedMatchTelemetry(matchId, lowerNickname) as any;
      if (cachedData?.fullResult) {
        const cachedVersion = cachedData.fullResult.v || 0;
        
        // [Stale-While-Revalidate] 캐시 데이터 버전이 낮으면 백그라운드 재분석 기동
        if (cachedVersion < RESULT_VERSION) {
          console.log(`[SWR-TRIGGER] Old version detected (v${cachedVersion} < v${RESULT_VERSION}). Re-analyzing in background: ${matchId}/${lowerNickname}`);
          
          const reanalyzePromise = reanalyzeAndSave(
            matchId, nickname, platform, lowerNickname, matchData, teamNames, teamAccountIds,
            myRosterId, myParticipant, teamStats, rankPct, matchAttr, rosters, participants, request.url,
            true, source
          ).catch(err => {
            console.error(`[SWR-BACKGROUND-ERROR] Background reanalysis failed for ${matchId}:`, err.message);
          });

          // Next.js request.waitUntil 이 지원되면 백그라운드 작업 생명주기 관리
          if (typeof (request as any).waitUntil === 'function') {
            (request as any).waitUntil(reanalyzePromise);
          }
        }

        // 샘플 참가자 추출 (기존 response 형식 호환)
        const allParticipantNames = participants
          .filter((p: any) => !p.attributes.stats.playerId?.startsWith("ai."))
          .map((p: any) => p.attributes.stats.name)
          .filter((name: string) => normalizeName(name) !== lowerNickname);
        const sampleParticipants = allParticipantNames
          .sort(() => 0.5 - Math.random())
          .slice(0, 5);

        return NextResponse.json({
          ...cachedData.fullResult,
          sampleParticipants
        });
      }
    }

    // 캐시가 없거나 강제 업데이트가 필요한 경우 동기식 분석 실행
    const finalResponse = await reanalyzeAndSave(
      matchId, nickname, platform, lowerNickname, matchData, teamNames, teamAccountIds,
      myRosterId, myParticipant, teamStats, rankPct, matchAttr, rosters, participants, request.url,
      shouldForce, source
    );

    return NextResponse.json(finalResponse);

  } catch (err: any) {
    console.error(`[CRITICAL-FAILURE]`, err);
    const isRateLimit = err.message?.includes("429") || err.status === 429;
    const status = isRateLimit ? 429 : 500;
    const errorMsg = isRateLimit
      ? "PUBG API 호출 한도가 일시적으로 초과되었습니다. 약 1분 후 다시 시도해 주세요."
      : err.message;

    // [MONITORING] PUBG API 에러 감지 및 기록
    await reportPubgApiError("/api/pubg/match", status, errorMsg, err.stack || err.message);

    return NextResponse.json({ error: errorMsg }, { status });
  }
}

/**
 * 텔레메트리를 분석하고 분석 데이터를 R2 스토리지 및 DB에 저장하는 중추 로직
 */
async function reanalyzeAndSave(
  matchId: string,
  nickname: string,
  platform: string,
  lowerNickname: string,
  matchData: any,
  teamNames: Set<string>,
  teamAccountIds: Set<string>,
  myRosterId: string,
  myParticipant: any,
  teamStats: any[],
  rankPct: number,
  matchAttr: any,
  rosters: any[],
  participants: any[],
  requestUrl: string,
  force: boolean = false,
  source: string = 'user'  // 'user' | 'scraper'
) {
  const telemetryAsset = matchData.included.find((it: any) => it.type === "asset");
  let telData: any[] = [];

  if (telemetryAsset) {
    const analyzePath = `${matchId}_${lowerNickname}_v${TELEMETRY_VERSION}_analyze.json`;
    const fileText = force ? null : await downloadFromR2(analyzePath);

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
      const rawTel = await safeJsonParse(telRes);

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
          return { x: Math.round(loc.x), y: Math.round(loc.y), z: Math.round(loc.z || 0) };
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
              vehicle: char.vehicle
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

        if (e.common?.isGame !== undefined) slim.common = { isGame: e.common.isGame };
        else if (e.Common?.IsGame !== undefined) slim.Common = { IsGame: e.Common.IsGame };

        if (e._T === "LogMatchEnd") {
          if (e.allWeaponStats !== undefined) slim.allWeaponStats = e.allWeaponStats;
          if (e.characters !== undefined) slim.characters = e.characters;
        }

        return slim;
      });

      await uploadToR2(analyzePath, JSON.stringify(telData), 'application/json');
    }
  }

  const getMatchTier = (pct: number) => {
    if (pct <= 0.1) return 'S';
    if (pct <= 0.3) return 'A';
    if (pct <= 0.6) return 'B';
    return 'C';
  };
  const matchTier = getMatchTier(rankPct);

  const { data: tierStats } = await supabase
    .from('benchmark_stats_by_tier')
    .select('*')
    .eq('game_mode', matchAttr.gameMode)
    .eq('tier', getBaseTier(matchTier))
    .maybeSingle();

  const bench = adaptBenchmark(tierStats);

  const engine = new AnalysisEngine(
    nickname, myParticipant.attributes.stats.playerId || myParticipant.attributes.accountId, teamNames, teamAccountIds,
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
    breakdown: { combat: 20, tactical: 20, survival: 20 }
  };

  const fullResult = {
    ...result,
    v: RESULT_VERSION,
    matchId,
    player_id: lowerNickname,
    platform,
    matchInfo: {
      map: MAP_NAMES[matchAttr.mapId] || matchAttr.mapId,
      mapId: MAP_IDS[matchAttr.mapId] || 'erangel',
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

  const { mapData, ...tacticalResult } = fullResult;
  const mapCachePath = `${matchId}_v${TELEMETRY_VERSION}_map.json`;

  // 1. 아군 전체 멤버(나 포함)에 대한 Supabase processed_match_telemetry Co-Upsert 생성
  const dbUpsertPromises = Array.from(teamNames).map((memberNickname) => {
    const lowerMemberName = normalizeName(memberNickname);
    const memberTacticalResult = {
      ...tacticalResult,
      player_id: lowerMemberName
    };
    return supabase.from("processed_match_telemetry").upsert({
      match_id: matchId,
      player_id: lowerMemberName,
      data: { fullResult: memberTacticalResult },
      updated_at: new Date().toISOString()
    });
  });

  await Promise.all([
    uploadToR2(mapCachePath, JSON.stringify(mapData), 'application/json'),
    ...dbUpsertPromises,
    supabase.from("match_master_telemetry").upsert({
      match_id: matchId,
      map_name: matchAttr.mapId,
      game_mode: matchAttr.gameMode,
      telemetry_version: Math.floor(TELEMETRY_VERSION),
      storage_path: mapCachePath
    }, { onConflict: 'match_id' })
  ]);

  fetch(`${new URL(requestUrl).origin}/api/pubg/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      matchId, 
      playerNickname: lowerNickname, 
      finalResult: tacticalResult,
      matchAttr,
      rawParticipants: participants,
      source  // 'user' | 'scraper' — global_benchmarks 출처 구분
    })
  }).catch(e => console.error("[MATCH-API] Ingest trigger failed:", e));

  const allParticipantNames = participants
    .filter((p: any) => !p.attributes.stats.playerId?.startsWith("ai."))
    .map((p: any) => p.attributes.stats.name)
    .filter((name: string) => normalizeName(name) !== lowerNickname);

  const sampleParticipants = allParticipantNames
    .sort(() => 0.5 - Math.random())
    .slice(0, 5);

  return {
    ...fullResult,
    sampleParticipants
  };
}
