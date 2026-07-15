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

export type IngestPlatform = "steam" | "kakao";
export type IngestSource = "user" | "scraper";

type ParticipantStats = JsonObject & {
  name: string;
  playerId?: string;
  damageDealt: number;
  kills: number;
  winPlace: number;
};

type RawParticipant = JsonObject & {
  id?: string;
  attributes: JsonObject & { stats: ParticipantStats };
};

type MatchAttributes = JsonObject & {
  gameMode?: string;
  mapName?: string;
};

type FinalResultStats = JsonObject & {
  damageDealt?: number;
  kills?: number;
  winPlace?: number;
  timeSurvived?: number;
};

type TradeStats = JsonObject & {
  teammateKnocks?: number;
  counterLatencyMs?: number;
  revCount?: number;
  smokeRescues?: number;
  tradeKills?: number;
  tradeLatencyMs?: number;
  suppCount?: number;
  enemyTeamWipes?: number;
};

type KillContribution = JsonObject & {
  solo?: number;
  assist?: number;
  cleanup?: number;
};

type FinalResult = JsonObject & {
  matchType: string;
  gameMode: string;
  isValidBenchmark: boolean;
  stats: FinalResultStats;
  mapName?: string;
  tradeStats?: TradeStats;
  killContribution?: KillContribution;
  initiative_rate?: number;
  isolationData?: JsonObject & {
    isCrossfire?: boolean;
    isolationIndex?: number;
    minDist?: number;
    heightDiff?: number;
  };
  combatPressure?: JsonObject & {
    pressureIndex?: number;
    utilityStats?: JsonObject & { throwCount?: number };
  };
  itemUseSummary?: JsonObject & { smokes?: number; frags?: number };
  deathDistance?: number;
  duelStats?: JsonObject & { reversalRate?: number; duelWinRate?: number };
  itemUseStats?: JsonObject & { lethalThrowCount?: number };
  benchmark?: JsonObject & {
    tier?: string | null;
    score?: number;
    breakdown?: JsonObject & {
      combat?: number;
      tactical?: number;
      survival?: number;
    };
  };
  deathPhase?: number;
};

export type IngestRouteBody = JsonObject & {
  matchId: string;
  playerNickname: string;
  platform: IngestPlatform;
  finalResult: FinalResult;
  source: IngestSource;
  rawParticipants?: RawParticipant[];
  matchAttr?: MatchAttributes;
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
      await reader.cancel().catch(() => undefined);
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasOptionalNumberFields(value: unknown, fields: readonly string[]): boolean {
  if (value === undefined) return true;
  if (!isPlainObject(value)) return false;

  return fields.every((field) => value[field] === undefined || isFiniteNumber(value[field]));
}

function isValidRawParticipant(value: unknown): value is RawParticipant {
  if (!isPlainObject(value) || !isPlainObject(value.attributes)) return false;

  const stats = value.attributes.stats;
  if (!isPlainObject(stats)) return false;
  if (!isNonEmptyString(stats.name, MAX_PLAYER_NICKNAME_LENGTH)) return false;
  if (stats.playerId !== undefined && !isNonEmptyString(stats.playerId, MAX_MATCH_ID_LENGTH)) return false;
  if (!isFiniteNumber(stats.damageDealt) || !isFiniteNumber(stats.kills) || !isFiniteNumber(stats.winPlace)) {
    return false;
  }

  return stats.playerId !== undefined || isNonEmptyString(value.id, MAX_MATCH_ID_LENGTH);
}

function isValidBenchmarkFields(finalResult: JsonObject): boolean {
  const stats = finalResult.stats;
  if (!isPlainObject(stats)
    || !isFiniteNumber(stats.damageDealt)
    || !isFiniteNumber(stats.kills)
    || !isFiniteNumber(stats.winPlace)
    || (stats.timeSurvived !== undefined && !isFiniteNumber(stats.timeSurvived))) {
    return false;
  }
  if (finalResult.mapName !== undefined && !isNonEmptyString(finalResult.mapName, 128)) {
    return false;
  }
  if (!hasOptionalNumberFields(finalResult, ["initiative_rate", "deathDistance", "deathPhase"])) {
    return false;
  }
  if (!hasOptionalNumberFields(finalResult.tradeStats, [
    "teammateKnocks",
    "counterLatencyMs",
    "revCount",
    "smokeRescues",
    "tradeKills",
    "tradeLatencyMs",
    "suppCount",
    "enemyTeamWipes",
  ])) {
    return false;
  }
  if (!hasOptionalNumberFields(finalResult.killContribution, ["solo", "assist", "cleanup"])) {
    return false;
  }
  if (!hasOptionalNumberFields(finalResult.itemUseSummary, ["smokes", "frags"])) return false;
  if (!hasOptionalNumberFields(finalResult.duelStats, ["reversalRate", "duelWinRate"])) return false;
  if (!hasOptionalNumberFields(finalResult.itemUseStats, ["lethalThrowCount"])) return false;

  const isolationData = finalResult.isolationData;
  if (!hasOptionalNumberFields(isolationData, ["isolationIndex", "minDist", "heightDiff"])) return false;
  if (isPlainObject(isolationData)
    && isolationData.isCrossfire !== undefined
    && typeof isolationData.isCrossfire !== "boolean") {
    return false;
  }

  const combatPressure = finalResult.combatPressure;
  if (!hasOptionalNumberFields(combatPressure, ["pressureIndex"])) return false;
  if (isPlainObject(combatPressure)) {
    if (!hasOptionalNumberFields(combatPressure.utilityStats, ["throwCount"])) return false;
  }

  const benchmark = finalResult.benchmark;
  if (benchmark !== undefined) {
    if (!isPlainObject(benchmark)) return false;
    if (benchmark.tier !== undefined
      && benchmark.tier !== null
      && !isNonEmptyString(benchmark.tier, 16)) {
      return false;
    }
    if (benchmark.score !== undefined && !isFiniteNumber(benchmark.score)) return false;
    if (!hasOptionalNumberFields(benchmark.breakdown, ["combat", "tactical", "survival"])) return false;
  }

  return true;
}

function isValidFinalResult(value: unknown): value is FinalResult {
  if (!isPlainObject(value)) return false;
  if (!isNonEmptyString(value.matchType, 64) || !isNonEmptyString(value.gameMode, 64)) {
    return false;
  }
  if (typeof value.isValidBenchmark !== "boolean" || !isPlainObject(value.stats)) {
    return false;
  }
  if (!hasOptionalNumberFields(value.tradeStats, ["teammateKnocks"])) return false;
  if (!hasOptionalNumberFields(value.killContribution, ["solo", "assist", "cleanup"])) return false;
  return isValidBenchmarkFields(value);
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
  if (!isValidFinalResult(parsedBody.finalResult)) {
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
  if (Array.isArray(parsedBody.rawParticipants)
    && !parsedBody.rawParticipants.every(isValidRawParticipant)) {
    return { response: NextResponse.json({ error: "Invalid rawParticipants" }, { status: 400 }) };
  }
  if (parsedBody.matchAttr !== undefined && !isPlainObject(parsedBody.matchAttr)) {
    return { response: NextResponse.json({ error: "Invalid matchAttr" }, { status: 400 }) };
  }
  if (Array.isArray(parsedBody.rawParticipants)
    && parsedBody.rawParticipants.length > 0
    && (!isPlainObject(parsedBody.matchAttr)
      || !isNonEmptyString(parsedBody.matchAttr.gameMode, 64)
      || !isNonEmptyString(parsedBody.matchAttr.mapName, 128))) {
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

function buildPersistencePlan(body: IngestRouteBody) {
  const { matchId, playerNickname, finalResult, matchAttr, rawParticipants, source } = body;
  const lowerNickname = normalizeName(playerNickname);
  const platform = normalizePlatform(body.platform);
  const teammateKnocks = Math.max(1, finalResult.tradeStats?.teammateKnocks || 0);
  const totalKillContribution = Math.max(
    1,
    (finalResult.killContribution?.solo || 0)
      + (finalResult.killContribution?.assist || 0)
      + (finalResult.killContribution?.cleanup || 0),
  );

  const rawInserts = rawParticipants && matchAttr
    ? rawParticipants.map((participant) => ({
      match_id: matchId,
      platform,
      player_id: normalizeName(participant.attributes.stats.name),
      damage: Math.floor(participant.attributes.stats.damageDealt),
      kills: participant.attributes.stats.kills,
      win_place: participant.attributes.stats.winPlace,
      game_mode: matchAttr.gameMode,
      map_name: matchAttr.mapName,
    }))
    : null;

  const playerCacheInserts = rawParticipants && matchAttr
    ? rawParticipants
      .filter((participant) => !participant.attributes.stats.playerId?.startsWith("ai."))
      .map((participant) => ({
        id: participant.attributes.stats.playerId || participant.id,
        platform,
        nickname: participant.attributes.stats.name,
        lower_nickname: participant.attributes.stats.name.toLowerCase(),
        updated_at: new Date().toISOString(),
      }))
    : [];
  const playerCacheBatches: typeof playerCacheInserts[] = [];
  const playerCacheBatchSize = 25;
  for (let index = 0; index < playerCacheInserts.length; index += playerCacheBatchSize) {
    playerCacheBatches.push(playerCacheInserts.slice(index, index + playerCacheBatchSize));
  }

  const matchTypeLower = finalResult.matchType.toLowerCase();
  const gameModeLower = finalResult.gameMode.toLowerCase();
  const isStandardBattleRoyale = (matchTypeLower === "official" || matchTypeLower === "competitive")
    && gameModeLower !== "tdm"
    && gameModeLower !== "trainingroom";
  const stats = finalResult.stats;
  const globalBenchmarkInsert = finalResult.isValidBenchmark && isStandardBattleRoyale
    ? {
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
      trade_rate: Math.round((Math.min(
        finalResult.tradeStats?.teammateKnocks || 0,
        finalResult.tradeStats?.tradeKills || 0,
      ) / teammateKnocks) * 100),
      solo_kill_rate: Math.round(((finalResult.killContribution?.solo || 0) / totalKillContribution) * 100),
      reversal_rate: Math.round(finalResult.duelStats?.reversalRate || 0),
      duel_win_rate: Math.round(finalResult.duelStats?.duelWinRate || 0),
      trade_latency_ms: safeInteger(finalResult.tradeStats?.tradeLatencyMs),
      lethal_throw_count: safeInteger(finalResult.itemUseStats?.lethalThrowCount),
      tier: finalResult.benchmark?.tier || "C",
      score: safeNumber(finalResult.benchmark?.score),
      combat_score: safeNumber(finalResult.benchmark?.breakdown?.combat),
      tactical_score: safeNumber(finalResult.benchmark?.breakdown?.tactical),
      survival_score: safeNumber(finalResult.benchmark?.breakdown?.survival),
      supp_count: safeInteger(finalResult.tradeStats?.suppCount),
      team_wipes: safeInteger(finalResult.tradeStats?.enemyTeamWipes),
      match_type: matchTypeLower,
      death_phase: safeInteger(finalResult.deathPhase),
      filter_version: 8,
      source,
    }
    : null;

  return {
    matchId,
    lowerNickname,
    platform,
    rawInserts,
    playerCacheBatches,
    globalBenchmarkInsert,
    processedTelemetryRecord: buildProcessedTelemetryUpsert(
      matchId,
      lowerNickname,
      platform,
      finalResult,
    ),
  };
}

export async function POST(request: Request) {
  const validated = await validateIngestRequest(request);
  if ("response" in validated) {
    return validated.response;
  }

  const persistencePlan = buildPersistencePlan(validated.body);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const backgroundTasks: Array<{ name: string; task: PromiseLike<any> }> = [];

    if (persistencePlan.rawInserts) {
      backgroundTasks.push({
        name: "match_stats_raw",
        task: supabase.from("match_stats_raw").upsert(
          persistencePlan.rawInserts,
          { onConflict: "match_id,platform,player_id" },
        ),
      });

      (async () => {
        for (const batch of persistencePlan.playerCacheBatches) {
          const { error } = await supabase
            .from("pubg_player_cache")
            .upsert(batch, { onConflict: "id" });
          if (error) console.warn("[INGEST] Player cache batch upsert failed:", error.message);
        }
      })();
    }

    if (persistencePlan.globalBenchmarkInsert) {
      backgroundTasks.push({
        name: "global_benchmarks",
        task: supabase.from("global_benchmarks").upsert(
          persistencePlan.globalBenchmarkInsert,
          { onConflict: "match_id,platform,player_id" },
        ),
      });
    }

    backgroundTasks.push({
      name: "processed_match_telemetry",
      task: supabase.from("processed_match_telemetry").upsert(
        persistencePlan.processedTelemetryRecord,
        { onConflict: "match_id,platform,player_id" },
      ),
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
      console.error("[INGEST-API] Persistence failures:", {
        matchId: persistencePlan.matchId,
        platform: persistencePlan.platform,
        player: persistencePlan.lowerNickname,
        failures,
      });
      return NextResponse.json({ error: "Ingest persistence failed", failures }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[INGEST-API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
