import { getR2BucketUsage } from "@/lib/pubg-analysis/r2Service";

export const SUPABASE_FREE_DATABASE_LIMIT_BYTES = 500 * 1024 * 1024;
export const R2_FREE_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;

export type StorageUsageStatus = "ok" | "warn" | "critical" | "unavailable";

export type StorageHealthSummary = {
  generatedAt: string;
  database: {
    usedBytes: number;
    limitBytes: number;
    usagePercent: number;
    status: StorageUsageStatus;
    error: string | null;
  };
  r2: {
    bucketName: string | null;
    fileCount: number;
    totalSizeBytes: number;
    limitBytes: number;
    usagePercent: number;
    scannedPages: number;
    truncated: boolean;
    configured: boolean;
    status: StorageUsageStatus;
    error: string | null;
  };
  tables: Array<{
    table: string;
    count: number | null;
    status: StorageUsageStatus;
    error: string | null;
  }>;
  recommendations: string[];
};

const MONITORED_TABLES = [
  "pubg_player_cache",
  "match_stats_raw",
  "processed_match_telemetry",
  "match_master_telemetry",
  "global_benchmarks",
  "analytics_events",
  "match_ai_coaching_cache",
  "player_ai_summary_cache",
  "squad_ai_coaching_cache",
  "ai_usage_logs"
];

export async function buildStorageHealth(supabase: any): Promise<StorageHealthSummary> {
  const [database, r2, tables] = await Promise.all([
    fetchDatabaseUsage(supabase),
    fetchR2Usage(),
    fetchTableCounts(supabase)
  ]);

  return {
    generatedAt: new Date().toISOString(),
    database,
    r2,
    tables,
    recommendations: buildRecommendations(database, r2, tables)
  };
}

async function fetchDatabaseUsage(supabase: any): Promise<StorageHealthSummary["database"]> {
  try {
    const { data, error } = await supabase.rpc("get_db_size");
    if (error) throw error;
    const usedBytes = Number(data || 0);
    return {
      usedBytes,
      limitBytes: SUPABASE_FREE_DATABASE_LIMIT_BYTES,
      usagePercent: percent(usedBytes, SUPABASE_FREE_DATABASE_LIMIT_BYTES),
      status: statusForUsage(usedBytes, SUPABASE_FREE_DATABASE_LIMIT_BYTES),
      error: null
    };
  } catch (error: any) {
    return {
      usedBytes: 0,
      limitBytes: SUPABASE_FREE_DATABASE_LIMIT_BYTES,
      usagePercent: 0,
      status: "unavailable",
      error: error.message || String(error)
    };
  }
}

async function fetchR2Usage(): Promise<StorageHealthSummary["r2"]> {
  try {
    const usage = await getR2BucketUsage();
    return {
      bucketName: usage.bucketName,
      fileCount: usage.fileCount,
      totalSizeBytes: usage.totalSizeBytes,
      limitBytes: R2_FREE_STORAGE_LIMIT_BYTES,
      usagePercent: percent(usage.totalSizeBytes, R2_FREE_STORAGE_LIMIT_BYTES),
      scannedPages: usage.scannedPages,
      truncated: usage.truncated,
      configured: usage.configured,
      status: usage.configured ? statusForUsage(usage.totalSizeBytes, R2_FREE_STORAGE_LIMIT_BYTES) : "unavailable",
      error: null
    };
  } catch (error: any) {
    return {
      bucketName: null,
      fileCount: 0,
      totalSizeBytes: 0,
      limitBytes: R2_FREE_STORAGE_LIMIT_BYTES,
      usagePercent: 0,
      scannedPages: 0,
      truncated: false,
      configured: false,
      status: "unavailable",
      error: error.message || String(error)
    };
  }
}

async function fetchTableCounts(supabase: any): Promise<StorageHealthSummary["tables"]> {
  return Promise.all(
    MONITORED_TABLES.map(async (table) => {
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });
      return {
        table,
        count: error ? null : count || 0,
        status: error ? "unavailable" as const : "ok" as const,
        error: error?.message || null
      };
    })
  );
}

function buildRecommendations(
  database: StorageHealthSummary["database"],
  r2: StorageHealthSummary["r2"],
  tables: StorageHealthSummary["tables"]
) {
  const recommendations = [];
  if (database.status === "critical") {
    recommendations.push("Supabase DB가 Free 기준 80%를 넘었습니다. 오래된 analytics/cache 정리 승인과 테이블별 증가량 점검이 필요합니다.");
  } else if (database.status === "warn") {
    recommendations.push("Supabase DB가 Free 기준 60%를 넘었습니다. pubg_player_cache, match_stats_raw 증가 추이를 주간으로 확인하세요.");
  }

  if (r2.status === "critical") {
    recommendations.push("R2 텔레메트리 캐시가 80%를 넘었습니다. 오래된 원본 telemetry 객체 정리 정책을 검토하세요.");
  } else if (r2.status === "warn") {
    recommendations.push("R2 텔레메트리 캐시가 60%를 넘었습니다. 캐시 hit율과 객체 증가량을 함께 확인하세요.");
  }

  if (r2.truncated) {
    recommendations.push("R2 객체 수가 모니터링 상한을 넘었습니다. maxObjects를 올리거나 prefix별 분리 집계를 추가하세요.");
  }

  const unavailableTables = tables.filter((table) => table.status === "unavailable");
  if (unavailableTables.length > 0) {
    recommendations.push(`용량 점검 중 ${unavailableTables.length}개 테이블 조회가 실패했습니다. service role 권한과 테이블명을 확인하세요.`);
  }

  if (!recommendations.length) {
    recommendations.push("Supabase DB와 R2 캐시 용량은 현재 안정권입니다.");
  }
  return recommendations;
}

function percent(usedBytes: number, limitBytes: number) {
  if (!limitBytes) return 0;
  return Number(((usedBytes / limitBytes) * 100).toFixed(2));
}

function statusForUsage(usedBytes: number, limitBytes: number): StorageUsageStatus {
  const usage = percent(usedBytes, limitBytes);
  if (usage >= 80) return "critical";
  if (usage >= 60) return "warn";
  return "ok";
}
