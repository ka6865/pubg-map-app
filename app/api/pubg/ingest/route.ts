import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { normalizeName } from "@/lib/pubg-analysis/utils";
import { buildProcessedTelemetryUpsert, normalizePlatform } from "@/lib/pubg-analysis/cacheIdentity";

const MAX_INGEST_BODY_BYTES = 512 * 1024;
const MAX_PARTICIPANTS = 128;
const MAX_MATCH_ID_LENGTH = 128;
const MAX_PLAYER_NICKNAME_LENGTH = 32;
const ALLOWED_PLATFORMS = new Set(["steam", "kakao"]);
const ALLOWED_SOURCES = new Set(["user", "scraper"]);

type JsonObject = Record<string, unknown>;

type IngestRouteBody = JsonObject & {
  matchId: string;
  playerNickname: string;
  platform: "steam" | "kakao";
  finalResult: JsonObject;
  source: "user" | "scraper";
  rawParticipants?: unknown[];
  matchAttr?: JsonObject;
};

type ValidatedIngestRequest =
  | { body: IngestRouteBody }
  | { response: NextResponse };

function hasValidBearerToken(request: Request, secret: string): boolean {
  const authorization = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  const actualBuffer = Buffer.from(authorization);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

function payloadTooLargeResponse(): NextResponse {
  return NextResponse.json({ error: "Payload too large" }, { status: 413 });
}

async function readBodyWithinLimit(request: Request): Promise<
  | { rawBody: string }
  | { response: NextResponse }
> {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_INGEST_BODY_BYTES) {
      return { response: payloadTooLargeResponse() };
    }
  }

  if (!request.body) {
    return { rawBody: "" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_INGEST_BODY_BYTES) {
      await reader.cancel();
      return { response: payloadTooLargeResponse() };
    }
    chunks.push(value);
  }

  const bodyBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { rawBody: new TextDecoder().decode(bodyBytes) };
}

function isPlainObject(value: unknown): value is JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= maxLength;
}

async function readValidatedBody(request: Request): Promise<ValidatedIngestRequest> {
  const readResult = await readBodyWithinLimit(request);
  if ("response" in readResult) return readResult;

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(readResult.rawBody) as unknown;
  } catch {
    return { response: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) };
  }

  if (!isPlainObject(parsedBody)) {
    return { response: NextResponse.json({ error: "Invalid body" }, { status: 400 }) };
  }
  if (!isNonEmptyString(parsedBody.matchId, MAX_MATCH_ID_LENGTH)) {
    return { response: NextResponse.json({ error: "Invalid matchId" }, { status: 400 }) };
  }
  if (!isNonEmptyString(parsedBody.playerNickname, MAX_PLAYER_NICKNAME_LENGTH)) {
    return { response: NextResponse.json({ error: "Invalid playerNickname" }, { status: 400 }) };
  }
  if (!isPlainObject(parsedBody.finalResult)) {
    return { response: NextResponse.json({ error: "Invalid finalResult" }, { status: 400 }) };
  }
  if (typeof parsedBody.platform !== "string" || !ALLOWED_PLATFORMS.has(parsedBody.platform)) {
    return { response: NextResponse.json({ error: "Invalid platform" }, { status: 400 }) };
  }
  if (typeof parsedBody.source !== "string" || !ALLOWED_SOURCES.has(parsedBody.source)) {
    return { response: NextResponse.json({ error: "Invalid source" }, { status: 400 }) };
  }
  if (parsedBody.forceBenchmark === true) {
    return { response: NextResponse.json({ error: "forceBenchmark is not allowed" }, { status: 400 }) };
  }
  if (parsedBody.rawParticipants !== undefined && !Array.isArray(parsedBody.rawParticipants)) {
    return { response: NextResponse.json({ error: "Invalid rawParticipants" }, { status: 400 }) };
  }
  if (Array.isArray(parsedBody.rawParticipants) && parsedBody.rawParticipants.length > MAX_PARTICIPANTS) {
    return { response: NextResponse.json({ error: "Too many participants" }, { status: 413 }) };
  }
  if (parsedBody.matchAttr !== undefined && !isPlainObject(parsedBody.matchAttr)) {
    return { response: NextResponse.json({ error: "Invalid matchAttr" }, { status: 400 }) };
  }

  return { body: parsedBody as IngestRouteBody };
}

export async function validateIngestRequest(request: Request): Promise<ValidatedIngestRequest> {
  const secret = process.env.PUBG_INGEST_INTERNAL_SECRET;
  if (!secret) {
    return { response: NextResponse.json({ error: "Ingest is unavailable" }, { status: 503 }) };
  }
  if (!hasValidBearerToken(request, secret)) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return readValidatedBody(request);
}

function safeNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function safeInteger(value: unknown, fallback = 0): number {
  return Math.round(safeNumber(value, fallback));
}

export async function POST(request: Request) {
  const validated = await validateIngestRequest(request);
  if ("response" in validated) {
    return validated.response;
  }

  const body = validated.body;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const { matchId, playerNickname, source } = body;
    const finalResult = body.finalResult as Record<string, any>;
    const matchAttr = body.matchAttr as Record<string, any> | undefined;
    const rawParticipants = body.rawParticipants as any[] | undefined;

    const lowerNickname = normalizeName(playerNickname);
    const platform = normalizePlatform(body.platform);
    const backgroundTasks: Array<{ name: string; task: PromiseLike<any> }> = [];
    const teammateKnocks = Math.max(1, finalResult.tradeStats?.teammateKnocks || 0);
    const totalKillContribution = Math.max(
      1,
      (finalResult.killContribution?.solo || 0) +
      (finalResult.killContribution?.assist || 0) +
      (finalResult.killContribution?.cleanup || 0)
    );

    // 1. match_master_telemetry 저장은 match route에서 처리하므로 중복 방지를 위해 제거 (성능 최적화)

    // 2. match_stats_raw 저장
    if (rawParticipants && matchAttr) {
      const rawInserts = rawParticipants.map((p: any) => ({
        match_id: matchId,
        platform,
        player_id: normalizeName(p.attributes.stats.name),
        damage: Math.floor(p.attributes.stats.damageDealt),
        kills: p.attributes.stats.kills,
        win_place: p.attributes.stats.winPlace,
        game_mode: matchAttr.gameMode,
        map_name: matchAttr.mapName
      }));
      backgroundTasks.push({
        name: "match_stats_raw",
        task: supabase.from("match_stats_raw").upsert(rawInserts, { onConflict: 'match_id,platform,player_id' })
      });

      // [V55.0] 자동완성 데이터베이스 확장: 모든 참여자를 캐시에 등록 (데드락 방지를 위해 Ingest에서만 수행)
      const playerCacheInserts = rawParticipants
        .filter((p: any) => !p.attributes.stats.playerId?.startsWith("ai."))
        .map((p: any) => ({
          id: p.attributes.stats.playerId || p.id,
          platform,
          nickname: p.attributes.stats.name,
          lower_nickname: p.attributes.stats.name.toLowerCase(),
          updated_at: new Date().toISOString()
        }));

      // [V55.1] 25개 배치로 분할하여 Supabase statement_timeout 방지
      // (한번에 100개 upsert → DB timeout 간헐적 발생)
      const BATCH_SIZE = 25;
      const batches: typeof playerCacheInserts[] = [];
      for (let i = 0; i < playerCacheInserts.length; i += BATCH_SIZE) {
        batches.push(playerCacheInserts.slice(i, i + BATCH_SIZE));
      }
      // fire-and-forget — 실패해도 메인 로직 영향 없음
      (async () => {
        for (const batch of batches) {
          const { error } = await supabase
            .from("pubg_player_cache")
            .upsert(batch, { onConflict: "id" });
          if (error) console.warn("[INGEST] Player cache batch upsert failed:", error.message);
        }
      })();
    }

    // 3. global_benchmarks 저장 (고성과자 지표)
    // [V55.2] 아케이드/TDM/훈련장 데이터 오염 방지 필터 (대소문자 무시)
    const matchTypeLower = (finalResult.matchType || "").toLowerCase();
    const gameModeLower = (finalResult.gameMode || "").toLowerCase();
    const isStandardBR = (matchTypeLower === 'official' || matchTypeLower === 'competitive') && 
                         (gameModeLower !== 'tdm' && gameModeLower !== 'trainingroom');

    if (finalResult.isValidBenchmark && isStandardBR) {
      const stats = finalResult.stats;
      backgroundTasks.push({
        name: "global_benchmarks",
        task: supabase.from("global_benchmarks").upsert({
          match_id: matchId,
          platform,
          player_id: lowerNickname,
          damage: Math.floor(safeNumber(stats.damageDealt)),
          kills: safeInteger(stats.kills),
          win_place: safeInteger(stats.winPlace, 100),
          game_mode: finalResult.gameMode,
          map_name: finalResult.mapName,
          counter_latency_ms: safeInteger(finalResult.tradeStats?.counterLatencyMs),
          initiative_rate: safeInteger(finalResult.initiative_rate),
          revive_rate: Math.round(((finalResult.tradeStats?.revCount || 0) / teammateKnocks) * 100),
          is_crossfire: finalResult.isolationData?.isCrossfire || false,
          utility_count: safeInteger(finalResult.combatPressure?.utilityStats?.throwCount),
          smoke_count: safeInteger(finalResult.itemUseSummary?.smokes),
          frag_count: safeInteger(finalResult.itemUseSummary?.frags),
          pressure_index: safeInteger(finalResult.combatPressure?.pressureIndex),
          enemy_death_distance: safeInteger(finalResult.deathDistance),
          survival_time: safeInteger(stats.timeSurvived),
          isolation_index: safeInteger(finalResult.isolationData?.isolationIndex),
          min_dist: safeInteger(finalResult.isolationData?.minDist),
          height_diff: safeInteger(finalResult.isolationData?.heightDiff),
          smoke_rate: Math.round(((finalResult.tradeStats?.smokeRescues || 0) / teammateKnocks) * 100),
          trade_rate: Math.round((Math.min(finalResult.tradeStats?.teammateKnocks || 0, finalResult.tradeStats?.tradeKills || 0) / teammateKnocks) * 100),
          solo_kill_rate: Math.round(((finalResult.killContribution?.solo || 0) / totalKillContribution) * 100),
          reversal_rate: Math.round(finalResult.duelStats?.reversalRate || 0),
          duel_win_rate: Math.round(finalResult.duelStats?.duelWinRate || 0),
          trade_latency_ms: safeInteger(finalResult.tradeStats?.tradeLatencyMs),
          lethal_throw_count: safeInteger(finalResult.itemUseStats?.lethalThrowCount),
          tier: finalResult.benchmark?.tier || 'C',
          score: safeNumber(finalResult.benchmark?.score),
          combat_score: safeNumber(finalResult.benchmark?.breakdown?.combat),
          tactical_score: safeNumber(finalResult.benchmark?.breakdown?.tactical),
          survival_score: safeNumber(finalResult.benchmark?.breakdown?.survival),
          supp_count: safeInteger(finalResult.tradeStats?.suppCount),
          team_wipes: safeInteger(finalResult.tradeStats?.enemyTeamWipes),
          match_type: (finalResult.matchType || 'official').toLowerCase(),
          death_phase: safeInteger(finalResult.deathPhase),
          filter_version: 8,
          source: source || 'user'   // 'user' | 'scraper' — 출처 구분
        }, { onConflict: 'match_id,platform,player_id' })
      });
    }

    // 4. processed_match_telemetry 저장 (최종 결과)
    backgroundTasks.push({
      name: "processed_match_telemetry",
      task: supabase.from("processed_match_telemetry").upsert(
        buildProcessedTelemetryUpsert(matchId, lowerNickname, platform, finalResult),
        { onConflict: 'match_id,platform,player_id' }
      )
    });

    const settled = await Promise.allSettled(backgroundTasks.map(({ task }) => task));
    const failures = settled.flatMap((result, index) => {
      const taskName = backgroundTasks[index]?.name || `task-${index}`;
      if (result.status === "rejected") {
        return [{ taskName, message: result.reason?.message || String(result.reason) }];
      }
      if (result.value?.error) {
        return [{ taskName, message: result.value.error.message || String(result.value.error) }];
      }
      return [];
    });

    if (failures.length > 0) {
      console.error("[INGEST-API] Persistence failures:", { matchId, platform, player: lowerNickname, failures });
      return NextResponse.json({ error: "Ingest persistence failed", failures }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[INGEST-API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
