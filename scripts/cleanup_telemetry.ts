import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { TELEMETRY_VERSION } from "../lib/pubg-analysis/constants";

export type TelemetryCleanupMasterRow = {
  match_id: string;
  storage_path: string | null;
  telemetry_version: number | string | null;
  created_at: string;
};

type RangePage<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

export type TelemetryCleanupDependencies = {
  listMasterRows(): Promise<TelemetryCleanupMasterRow[]>;
  cleanupExpiredMatches(
    matchIds: string[],
    cutoff: Date,
    targetVersion: number,
  ): Promise<string[]>;
};

export type TelemetryCleanupConfig = {
  cutoff: Date;
  targetVersion: number;
};

export type TelemetryCleanupResult = {
  deletedMatchCount: number;
  r2DeletionDeferred: true;
};

const QUERY_PAGE_SIZE = 500;
const DELETE_BATCH_SIZE = 50;

export async function fetchAllRowsByRange<T>(
  fetchPage: (from: number, to: number) => Promise<RangePage<T>>,
  pageSize = QUERY_PAGE_SIZE,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1_000) {
    throw new Error("telemetry-cleanup-invalid-page-size");
  }

  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    if (page.error) {
      throw new Error(page.error.message || "telemetry-cleanup-page-read-failed");
    }
    if (page.data === null) {
      throw new Error("telemetry-cleanup-page-data-missing");
    }

    const data = page.data;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)];
}

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function isExpiredMasterRow(
  row: TelemetryCleanupMasterRow,
  config: TelemetryCleanupConfig,
): boolean {
  const telemetryVersion = Number(row.telemetry_version);
  const createdAt = Date.parse(row.created_at);
  if (!Number.isFinite(telemetryVersion) || !Number.isFinite(createdAt)) {
    throw new Error("telemetry-cleanup-invalid-master-row");
  }

  return telemetryVersion < config.targetVersion
    || createdAt < config.cutoff.getTime();
}

function validateConfig(config: TelemetryCleanupConfig): void {
  if (
    !Number.isFinite(config.cutoff.getTime())
    || !Number.isInteger(config.targetVersion)
    || config.targetVersion < 0
  ) {
    throw new Error("telemetry-cleanup-invalid-config");
  }
}

function validateCleanedMatchIds(
  requestedMatchIds: string[],
  cleanedMatchIds: string[],
): string[] {
  const requested = new Set(requestedMatchIds);
  const unique = uniqueValues(cleanedMatchIds);
  if (
    unique.length !== cleanedMatchIds.length
    || unique.some((matchId) => !requested.has(matchId))
  ) {
    throw new Error("telemetry-cleanup-invalid-rpc-result");
  }
  return unique;
}

export async function runTelemetryStorageCleanup(
  config: TelemetryCleanupConfig,
  dependencies: TelemetryCleanupDependencies,
): Promise<TelemetryCleanupResult> {
  validateConfig(config);
  const masterRows = await dependencies.listMasterRows();
  const expiredRows = masterRows.filter((row) => isExpiredMasterRow(row, config));
  const expiredMatchIds = uniqueValues(expiredRows.map((row) => row.match_id));
  let deletedMatchCount = 0;

  for (const matchIds of chunkValues(expiredMatchIds, DELETE_BATCH_SIZE)) {
    const cleanedMatchIds = await dependencies.cleanupExpiredMatches(
      matchIds,
      config.cutoff,
      config.targetVersion,
    );
    deletedMatchCount += validateCleanedMatchIds(matchIds, cleanedMatchIds).length;
  }

  return {
    deletedMatchCount,
    r2DeletionDeferred: true,
  };
}

function createTelemetryCleanupDependencies(
  supabase: SupabaseClient,
): TelemetryCleanupDependencies {
  return {
    listMasterRows: () => fetchAllRowsByRange(async (from, to) => {
      const { data, error } = await supabase
        .from("match_master_telemetry")
        .select("match_id, storage_path, telemetry_version, created_at")
        .order("match_id", { ascending: true })
        .range(from, to);
      return {
        data: data as TelemetryCleanupMasterRow[] | null,
        error,
      };
    }),
    cleanupExpiredMatches: async (matchIds, cutoff, targetVersion) => {
      const { data, error } = await supabase.rpc(
        "cleanup_expired_telemetry_matches",
        {
          p_match_ids: matchIds,
          p_cutoff: cutoff.toISOString(),
          p_target_version: targetVersion,
        },
      );
      if (error) throw new Error("telemetry-cleanup-expired-rpc-failed");
      if (!Array.isArray(data)) {
        throw new Error("telemetry-cleanup-invalid-rpc-result");
      }

      return data.map((row: unknown) => {
        if (
          typeof row !== "object"
          || row === null
          || typeof (row as { match_id?: unknown }).match_id !== "string"
        ) {
          throw new Error("telemetry-cleanup-invalid-rpc-result");
        }
        return (row as { match_id: string }).match_id;
      });
    },
  };
}

async function cleanupOrphanedAnalysisRows(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase.rpc("get_orphaned_match_ids");
  if (error) throw new Error("telemetry-cleanup-orphan-query-failed");

  const rows = (data ?? []) as Array<{ match_id: string | null }>;
  const matchIds = uniqueValues(
    rows
      .map((row) => row.match_id)
      .filter((matchId): matchId is string => Boolean(matchId)),
  );
  for (const batch of chunkValues(matchIds, DELETE_BATCH_SIZE)) {
    for (const table of ["match_stats_raw", "processed_match_telemetry"]) {
      const { error: deleteError } = await supabase
        .from(table)
        .delete()
        .in("match_id", batch);
      if (deleteError) throw new Error(`telemetry-cleanup-delete-${table}-failed`);
    }
  }
}

async function cleanupInactivePlayerCache(
  supabase: SupabaseClient,
  now: Date,
): Promise<void> {
  const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1_000).toISOString();
  const { error } = await supabase
    .from("pubg_player_cache")
    .delete()
    .eq("search_count", 0)
    .lt("updated_at", cutoff);
  if (error) throw new Error("telemetry-cleanup-player-cache-failed");
}

async function cleanupBenchmarks(supabase: SupabaseClient): Promise<void> {
  const { error: versionError } = await supabase
    .from("global_benchmarks")
    .delete()
    .lt("filter_version", 8);
  if (versionError) throw new Error("telemetry-cleanup-benchmark-version-failed");

  const tiers = [
    "S", "A+", "A", "A-", "B+", "B", "B-",
    "C+", "C", "C-", "D+", "D", "D-",
  ];
  const maximumSamplesPerTier = 500;
  for (const tier of tiers) {
    const { data, error } = await supabase
      .from("global_benchmarks")
      .select("id")
      .eq("tier", tier)
      .order("created_at", { ascending: false });
    if (error) throw new Error("telemetry-cleanup-benchmark-query-failed");
    const toDelete = (data ?? [])
      .slice(maximumSamplesPerTier)
      .map((row) => row.id);
    if (toDelete.length === 0) continue;
    const { error: deleteError } = await supabase
      .from("global_benchmarks")
      .delete()
      .in("id", toDelete);
    if (deleteError) throw new Error("telemetry-cleanup-benchmark-cap-failed");
  }
}

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key}-missing`);
  return value;
}

function parseIntegerEnv(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${key}-invalid`);
  return value;
}

export async function runTelemetryCleanupFromEnvironment(): Promise<void> {
  dotenv.config({ path: resolve(process.cwd(), ".env.local") });
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const currentVersion = Math.floor(TELEMETRY_VERSION);
  const configuredTargetVersion = parseIntegerEnv("CLEANUP_TARGET_VERSION", 56);
  const targetVersion = Math.min(configuredTargetVersion, currentVersion - 1);
  const retentionDays = parseIntegerEnv("CLEANUP_RETENTION_DAYS", 1);
  if (retentionDays < 1) {
    throw new Error("telemetry-cleanup-invalid-environment-config");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const now = new Date();
  const result = await runTelemetryStorageCleanup({
    cutoff: new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1_000),
    targetVersion,
  }, createTelemetryCleanupDependencies(supabase));

  await cleanupOrphanedAnalysisRows(supabase);
  await cleanupInactivePlayerCache(supabase, now);
  await cleanupBenchmarks(supabase);
  console.info(JSON.stringify(result));
}

const isDirectRun = Boolean(process.argv[1])
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  void runTelemetryCleanupFromEnvironment().catch(() => {
    console.error("텔레메트리 cleanup 작업이 실패했습니다.");
    process.exitCode = 1;
  });
}
