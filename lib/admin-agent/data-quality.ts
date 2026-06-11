import { normalizePlatform } from "@/lib/pubg-analysis/cacheIdentity";
import { normalizeName } from "@/lib/pubg-analysis/utils";

const DEFAULT_PAGE_SIZE = 250;
const DEFAULT_SAMPLE_LIMIT = 10;
const DEFAULT_TARGET_LIMIT = 50;

export type ProcessedTelemetryIdentityMismatch = {
  match_id: string;
  platform: string;
  player_id: string;
  statsName: string;
  embeddedPlayerId: string;
  resultPlatform: string;
  hasPlatformColumn: boolean;
  canDelete: boolean;
  reason: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ProcessedTelemetryIdentityAudit = {
  mode: "dry-run";
  table: "processed_match_telemetry";
  recentDays: number | null;
  maxRows: number | null;
  scannedRows: number;
  mismatchCount: number;
  missingPlatformColumnRows: number;
  deletionCandidateCount: number;
  samples: ProcessedTelemetryIdentityMismatch[];
  deletionTargets: ProcessedTelemetryIdentityMismatch[];
  truncated: boolean;
  generatedAt: string;
  error?: string;
};

export type ProcessedTelemetryIdentityTarget = {
  match_id: string;
  platform: string;
  player_id: string;
  reason?: string;
};

export type ProcessedTelemetryIdentityDeleteResult = {
  requested: number;
  deleted: number;
  skipped: number;
  failed: number;
  details: Array<{
    target: ProcessedTelemetryIdentityTarget;
    status: "deleted" | "skipped" | "failed";
    message: string;
  }>;
};

type AuditOptions = {
  recentDays?: number | null;
  maxRows?: number | null;
  pageSize?: number;
  sampleLimit?: number;
  targetLimit?: number;
};

export function findProcessedTelemetryIdentityMismatch(row: any): ProcessedTelemetryIdentityMismatch | null {
  const fullResult = row.data?.fullResult;
  const rowPlayerId = normalizeName(row.player_id || "");
  const hasPlatformColumn = Object.prototype.hasOwnProperty.call(row, "platform");
  const rowPlatform = normalizePlatform(row.platform);
  const statsName = normalizeName(fullResult?.stats?.name || "");
  const embeddedPlayerId = normalizeName(fullResult?.player_id || "");
  const resultPlatform = normalizePlatform(fullResult?.platform);
  const base = {
    match_id: String(row.match_id || ""),
    platform: rowPlatform,
    player_id: rowPlayerId,
    statsName,
    embeddedPlayerId,
    resultPlatform,
    hasPlatformColumn,
    canDelete: hasPlatformColumn && Boolean(row.match_id && rowPlayerId),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };

  if (!fullResult) {
    return { ...base, reason: "fullResult 없음" };
  }

  if (!statsName || statsName !== rowPlayerId) {
    return { ...base, reason: "row.player_id와 fullResult.stats.name 불일치" };
  }

  if (embeddedPlayerId && embeddedPlayerId !== rowPlayerId) {
    return { ...base, reason: "row.player_id와 fullResult.player_id 불일치" };
  }

  if (resultPlatform !== rowPlatform) {
    return { ...base, reason: "row.platform과 fullResult.platform 불일치" };
  }

  return null;
}

export async function auditProcessedTelemetryIdentity(
  supabase: any,
  options: AuditOptions = {}
): Promise<ProcessedTelemetryIdentityAudit> {
  const pageSize = clampPositiveInteger(options.pageSize, DEFAULT_PAGE_SIZE);
  const sampleLimit = clampPositiveInteger(options.sampleLimit, DEFAULT_SAMPLE_LIMIT);
  const targetLimit = clampPositiveInteger(options.targetLimit, DEFAULT_TARGET_LIMIT);
  const maxRows = options.maxRows === null || options.maxRows === undefined
    ? null
    : Math.max(1, Number(options.maxRows) || DEFAULT_PAGE_SIZE);
  const recentDays = options.recentDays === null || options.recentDays === undefined
    ? null
    : Math.max(1, Number(options.recentDays) || 1);
  const cutoffIso = recentDays
    ? new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const samples: ProcessedTelemetryIdentityMismatch[] = [];
  const deletionTargets: ProcessedTelemetryIdentityMismatch[] = [];
  let scannedRows = 0;
  let mismatchCount = 0;
  let missingPlatformColumnRows = 0;
  let deletionCandidateCount = 0;
  let truncated = false;
  let selectColumns = "match_id, platform, player_id, data, created_at, updated_at";

  for (let from = 0; ; from += pageSize) {
    const remaining = maxRows === null ? pageSize : Math.min(pageSize, maxRows - scannedRows);
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const to = from + remaining - 1;
    let query = supabase
      .from("processed_match_telemetry")
      .select(selectColumns)
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (cutoffIso) query = query.gte("updated_at", cutoffIso);

    let { data, error } = await query;
    if (error && selectColumns.includes("platform") && isMissingPlatformColumnError(error)) {
      selectColumns = "match_id, player_id, data, created_at, updated_at";
      const retryQuery = supabase
        .from("processed_match_telemetry")
        .select(selectColumns)
        .order("updated_at", { ascending: false })
        .range(from, to);
      const retry = cutoffIso ? await retryQuery.gte("updated_at", cutoffIso) : await retryQuery;
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      scannedRows++;
      if (!Object.prototype.hasOwnProperty.call(row, "platform")) {
        missingPlatformColumnRows++;
      }

      const mismatch = findProcessedTelemetryIdentityMismatch(row);
      if (!mismatch) continue;

      mismatchCount++;
      if (samples.length < sampleLimit) samples.push(mismatch);
      if (mismatch.canDelete) {
        deletionCandidateCount++;
        if (deletionTargets.length < targetLimit) deletionTargets.push(mismatch);
      }
    }

    if (data.length < remaining) break;
  }

  return {
    mode: "dry-run",
    table: "processed_match_telemetry",
    recentDays,
    maxRows,
    scannedRows,
    mismatchCount,
    missingPlatformColumnRows,
    deletionCandidateCount,
    samples,
    deletionTargets,
    truncated,
    generatedAt: new Date().toISOString()
  };
}

export function buildProcessedTelemetryIdentityRepairPayload(
  audit: ProcessedTelemetryIdentityAudit,
  targetLimit = DEFAULT_TARGET_LIMIT
) {
  const targets = audit.deletionTargets.slice(0, targetLimit).map(toIdentityTarget);
  return {
    title: "processed_match_telemetry identity mismatch 정리",
    cleanupType: "repair_processed_telemetry_identity",
    reason: "Agent monitor가 row.player_id/platform과 fullResult 내부 식별자가 다른 분석 캐시를 감지했습니다.",
    auditWindowDays: audit.recentDays,
    scannedRows: audit.scannedRows,
    mismatchCount: audit.mismatchCount,
    deletionCandidateCount: audit.deletionCandidateCount,
    targetCount: targets.length,
    targets,
    samples: audit.samples.map(toIdentityTargetWithEvidence),
    warnings: [
      "승인 시 targets에 포함된 identity mismatch row만 재검증 후 삭제합니다.",
      "원본 match_master_telemetry와 R2 텔레메트리는 삭제하지 않습니다.",
      "연막/회복 집계값 오염 가능 row는 자동 삭제하지 않고 재분석으로 교체합니다.",
      ...(audit.deletionCandidateCount > targets.length
        ? [`삭제 후보 ${audit.deletionCandidateCount}건 중 ${targets.length}건만 이번 승인 대상으로 제한했습니다.`]
        : [])
    ]
  };
}

export async function validateProcessedTelemetryIdentityTargets(
  supabase: any,
  targets: ProcessedTelemetryIdentityTarget[]
) {
  const valid: ProcessedTelemetryIdentityMismatch[] = [];
  const skipped: Array<{ target: ProcessedTelemetryIdentityTarget; reason: string }> = [];

  for (const target of targets) {
    if (!target.match_id || !target.platform || !target.player_id) {
      skipped.push({ target, reason: "필수 식별자 누락" });
      continue;
    }

    const { data, error } = await supabase
      .from("processed_match_telemetry")
      .select("match_id, platform, player_id, data, created_at, updated_at")
      .eq("match_id", target.match_id)
      .eq("platform", normalizePlatform(target.platform))
      .eq("player_id", normalizeName(target.player_id))
      .maybeSingle();

    if (error) {
      skipped.push({ target, reason: error.message || "조회 실패" });
      continue;
    }
    if (!data) {
      skipped.push({ target, reason: "이미 없거나 재분석으로 교체됨" });
      continue;
    }

    const mismatch = findProcessedTelemetryIdentityMismatch(data);
    if (!mismatch) {
      skipped.push({ target, reason: "현재 row는 identity mismatch가 아님" });
      continue;
    }
    valid.push(mismatch);
  }

  return { valid, skipped };
}

export async function deleteProcessedTelemetryIdentityTargets(
  supabase: any,
  targets: ProcessedTelemetryIdentityTarget[]
): Promise<ProcessedTelemetryIdentityDeleteResult> {
  const result: ProcessedTelemetryIdentityDeleteResult = {
    requested: targets.length,
    deleted: 0,
    skipped: 0,
    failed: 0,
    details: []
  };

  const validation = await validateProcessedTelemetryIdentityTargets(supabase, targets);
  validation.skipped.forEach(item => {
    result.skipped++;
    result.details.push({ target: item.target, status: "skipped", message: item.reason });
  });

  for (const mismatch of validation.valid) {
    const target = toIdentityTarget(mismatch);
    const { count, error } = await supabase
      .from("processed_match_telemetry")
      .delete({ count: "exact" })
      .eq("match_id", target.match_id)
      .eq("platform", target.platform)
      .eq("player_id", target.player_id);

    if (error) {
      result.failed++;
      result.details.push({ target, status: "failed", message: error.message || "삭제 실패" });
    } else {
      const deletedCount = count || 0;
      result.deleted += deletedCount;
      result.details.push({
        target,
        status: deletedCount > 0 ? "deleted" : "skipped",
        message: deletedCount > 0 ? `${deletedCount}개 row 삭제` : "삭제 대상 row 없음"
      });
      if (deletedCount === 0) result.skipped++;
    }
  }

  return result;
}

export function toIdentityTarget(mismatch: ProcessedTelemetryIdentityMismatch): ProcessedTelemetryIdentityTarget {
  return {
    match_id: mismatch.match_id,
    platform: normalizePlatform(mismatch.platform),
    player_id: normalizeName(mismatch.player_id),
    reason: mismatch.reason
  };
}

function toIdentityTargetWithEvidence(mismatch: ProcessedTelemetryIdentityMismatch) {
  return {
    ...toIdentityTarget(mismatch),
    statsName: mismatch.statsName,
    embeddedPlayerId: mismatch.embeddedPlayerId,
    resultPlatform: mismatch.resultPlatform,
    hasPlatformColumn: mismatch.hasPlatformColumn
  };
}

function clampPositiveInteger(value: number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function isMissingPlatformColumnError(error: any) {
  const message = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  return message.includes("platform") && (message.includes("column") || message.includes("schema cache"));
}
