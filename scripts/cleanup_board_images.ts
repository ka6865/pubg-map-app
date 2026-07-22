import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BOARD_IMAGE_BUCKET, isUuid } from "../lib/board/imageStorageContract";

export const BOARD_IMAGE_CLEANUP_BATCH_LIMIT = 20;
export const BOARD_IMAGE_CLEANUP_MAX_BATCHES = 5;
export const BOARD_IMAGE_CLEANUP_MAX_DURATION_MS = 30_000;
export const BOARD_IMAGE_DELETION_LEASE_SECONDS = 300;

type BoardImageCleanupClient = Pick<SupabaseClient, "rpc" | "storage">;

type CleanupDependencies = {
  env?: Record<string, string | undefined>;
  createServiceClient?: (url: string, serviceRoleKey: string) => SupabaseClient;
  now?: () => Date;
  nowMs?: () => number;
  write?: (message: string) => void;
};

type BoardImageClaim = {
  image_id: string;
  bucket_id: string;
  storage_key: string;
  lease_token: string;
};

export type BoardImageCleanupResult = {
  batches: number;
  claimed: number;
  finalized: number;
  deferred: number;
  hasRemaining: boolean;
};

function isClaim(value: unknown): value is BoardImageClaim {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const claim = value as Record<string, unknown>;
  return isUuid(claim.image_id)
    && claim.bucket_id === BOARD_IMAGE_BUCKET
    && claim.storage_key === claim.image_id
    && isUuid(claim.lease_token);
}

function isValidClaimBatch(data: unknown[]): data is BoardImageClaim[] {
  const imageIds = new Set<string>();
  return data.every((claim) => {
    if (!isClaim(claim) || imageIds.has(claim.image_id)) return false;
    imageIds.add(claim.image_id);
    return true;
  });
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as Record<string, unknown>;
  return value.statusCode === 404 || value.statusCode === "404" || value.status === 404;
}

export async function cleanupBoardImages(
  supabaseAdmin: BoardImageCleanupClient,
  dependencies: Pick<CleanupDependencies, "now" | "nowMs" | "write"> = {},
): Promise<BoardImageCleanupResult> {
  const now = dependencies.now ?? (() => new Date());
  const nowMs = dependencies.nowMs ?? Date.now;
  const startedAt = nowMs();
  let batches = 0;
  let claimed = 0;
  let finalized = 0;
  let deferred = 0;
  let hasRemaining = false;

  while (
    batches < BOARD_IMAGE_CLEANUP_MAX_BATCHES
    && nowMs() - startedAt < BOARD_IMAGE_CLEANUP_MAX_DURATION_MS
  ) {
    const claimNow = now();
    if (!Number.isFinite(claimNow.getTime())) throw new Error("board-image-cleanup-invalid-now");
    const { data, error } = await supabaseAdmin.rpc("claim_board_image_deletions", {
      p_limit: BOARD_IMAGE_CLEANUP_BATCH_LIMIT,
      p_now: claimNow.toISOString(),
      p_lease_seconds: BOARD_IMAGE_DELETION_LEASE_SECONDS,
    });
    if (error || !Array.isArray(data) || data.length > BOARD_IMAGE_CLEANUP_BATCH_LIMIT || !isValidClaimBatch(data)) {
      throw new Error("board-image-cleanup-claim-failed");
    }
    if (data.length === 0) break;

    batches += 1;
    claimed += data.length;
    for (const claim of data) {
      let deleted = false;
      try {
        const { error: removeError } = await supabaseAdmin.storage.from(claim.bucket_id).remove([claim.storage_key]);
        deleted = !removeError || isNotFound(removeError);
      } catch {
        deleted = false;
      }
      const { data: finalizedData, error: finalizeError } = await supabaseAdmin.rpc("finalize_board_image_deletion", {
        p_image_id: claim.image_id,
        p_lease_token: claim.lease_token,
        p_deleted: deleted,
      });
      if (finalizeError || finalizedData !== true) throw new Error("board-image-cleanup-finalize-failed");
      finalized += 1;
      if (!deleted) deferred += 1;
    }
    hasRemaining = data.length === BOARD_IMAGE_CLEANUP_BATCH_LIMIT;
    if (!hasRemaining) break;
  }

  dependencies.write?.(`board-image-cleanup batches=${batches} claimed=${claimed} finalized=${finalized} deferred=${deferred} backlog=${hasRemaining}`);
  return { batches, claimed, finalized, deferred, hasRemaining };
}

export async function runBoardImageCleanup(
  dependencies: CleanupDependencies = {},
): Promise<BoardImageCleanupResult> {
  const env = dependencies.env ?? process.env;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) throw new Error("board-image-cleanup-credentials-missing");
  const createServiceClient = dependencies.createServiceClient ?? ((url, key) => createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }));
  return cleanupBoardImages(createServiceClient(supabaseUrl, serviceRoleKey), dependencies);
}

const isDirectRun = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  runBoardImageCleanup({ write: (message) => process.stdout.write(`${message}\n`) })
    .catch(() => {
      process.stderr.write("Board image cleanup failed.\n");
      process.exitCode = 1;
    });
}
