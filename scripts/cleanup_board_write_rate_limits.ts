import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const BOARD_WRITE_QUOTA_RETENTION_HOURS = 24;
export const BOARD_WRITE_QUOTA_CLEANUP_MAX_ROWS = 1000;

type BoardWriteQuotaRpcClient = Pick<SupabaseClient, "rpc">;

type CleanupEnvironment = Record<string, string | undefined>;

type CleanupDependencies = {
  env?: CleanupEnvironment;
  createServiceClient?: (url: string, serviceRoleKey: string) => SupabaseClient;
  now?: () => Date;
};

export type BoardWriteQuotaCleanupResult = {
  cutoff: string;
  deletedRows: number;
  maxRows: number;
};

export async function cleanupBoardWriteRateLimits(
  supabaseAdmin: BoardWriteQuotaRpcClient,
  now = new Date(),
): Promise<BoardWriteQuotaCleanupResult> {
  if (!Number.isFinite(now.getTime())) {
    throw new Error("board-write-quota-cleanup-invalid-now");
  }

  const cutoff = new Date(
    now.getTime() - BOARD_WRITE_QUOTA_RETENTION_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await supabaseAdmin.rpc(
    "cleanup_board_write_rate_limits",
    {
      p_cutoff: cutoff,
      p_max_rows: BOARD_WRITE_QUOTA_CLEANUP_MAX_ROWS,
    },
  );

  if (
    error
    || typeof data !== "number"
    || !Number.isInteger(data)
    || data < 0
    || data > BOARD_WRITE_QUOTA_CLEANUP_MAX_ROWS
  ) {
    throw new Error("board-write-quota-cleanup-rpc-failed");
  }

  return {
    cutoff,
    deletedRows: data,
    maxRows: BOARD_WRITE_QUOTA_CLEANUP_MAX_ROWS,
  };
}

export async function runBoardWriteQuotaCleanup(
  dependencies: CleanupDependencies = {},
): Promise<BoardWriteQuotaCleanupResult> {
  const env = dependencies.env ?? process.env;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("board-write-quota-cleanup-credentials-missing");
  }

  const createServiceClient = dependencies.createServiceClient ?? ((url, key) => (
    createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  ));
  const supabaseAdmin = createServiceClient(supabaseUrl, serviceRoleKey);

  return cleanupBoardWriteRateLimits(
    supabaseAdmin,
    dependencies.now?.() ?? new Date(),
  );
}

const isDirectRun = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  runBoardWriteQuotaCleanup()
    .then((result) => {
      console.info(`Board write quota cleanup deleted ${result.deletedRows} rows.`);
    })
    .catch(() => {
      console.error("Board write quota cleanup failed.");
      process.exitCode = 1;
    });
}
