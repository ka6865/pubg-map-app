import {
  BOARD_IMAGE_BUCKET,
  type BoardImageMimeType,
  isUuid,
} from "./imageStorageContract";

type RpcResult<T> = PromiseLike<{ data: T; error: unknown }>;

type SignedUploadResult = PromiseLike<{
  data: { token?: string } | null;
  error: unknown;
}>;

type StorageRemoveResult = PromiseLike<{ error: unknown }>;

export type BoardImageStorageAdmin = {
  rpc(name: string, params: Record<string, unknown>): RpcResult<unknown>;
  storage: {
    from(bucketId: string): {
      createSignedUploadUrl(storageKey: string, options: { upsert: false }): SignedUploadResult;
      remove(storageKeys: string[]): StorageRemoveResult;
    };
  };
};

type ReservedImageRow = {
  image_id: string;
  bucket_id: string;
  storage_key: string;
};

type ClaimedImageRow = ReservedImageRow & {
  lease_token: string;
};

export type ImageStorageResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 429 | 503 };

export async function reserveBoardImageUpload(input: {
  supabaseAdmin: BoardImageStorageAdmin;
  ownerUserId: string;
  mimeType: BoardImageMimeType;
  byteSize: number;
}): Promise<ImageStorageResult<{
  imageId: string;
  bucketId: string;
  storageKey: string;
  token: string;
  publicUrl: string;
}>> {
  let reservation: { data: unknown; error: unknown };
  try {
    reservation = await input.supabaseAdmin.rpc("reserve_board_image_upload", {
      p_owner_user_id: input.ownerUserId,
      p_expected_mime_type: input.mimeType,
      p_max_bytes: input.byteSize,
    });
  } catch {
    return { ok: false, status: 503 };
  }
  if (reservation.error) return { ok: false, status: 503 };
  const reservationResult = getReservationResult(reservation.data);
  if (!reservationResult) return { ok: false, status: 503 };
  if (reservationResult.status === 429) return { ok: false, status: 429 };
  const row = reservationResult.row;

  let signedResult: { data: { token?: string } | null; error: unknown };
  try {
    signedResult = await input.supabaseAdmin.storage
      .from(BOARD_IMAGE_BUCKET)
      .createSignedUploadUrl(row.storage_key, { upsert: false });
  } catch {
    return { ok: false, status: 503 };
  }
  const { data: signed, error } = signedResult;
  if (error || !signed?.token) return { ok: false, status: 503 };

  return {
    ok: true,
    data: {
      imageId: row.image_id,
      bucketId: row.bucket_id,
      storageKey: row.storage_key,
      token: signed.token,
      publicUrl: toBoardImagePublicUrl(row.bucket_id, row.storage_key),
    },
  };
}

export async function completeBoardImageUpload(input: {
  supabaseAdmin: BoardImageStorageAdmin;
  ownerUserId: string;
  imageId: string;
}): Promise<ImageStorageResult<{ imageId: string; publicUrl: string }>> {
  let completion: { data: unknown; error: unknown };
  try {
    completion = await input.supabaseAdmin.rpc("complete_board_image_upload", {
      p_image_id: input.imageId,
      p_owner_user_id: input.ownerUserId,
    });
  } catch {
    return { ok: false, status: 503 };
  }
  const { data, error } = completion;
  if (error) return { ok: false, status: 503 };
  if (data !== true) return { ok: false, status: 404 };

  return {
    ok: true,
    data: {
      imageId: input.imageId,
      publicUrl: toBoardImagePublicUrl(BOARD_IMAGE_BUCKET, input.imageId),
    },
  };
}

export async function releaseBoardImages(input: {
  supabaseAdmin: BoardImageStorageAdmin;
  ownerUserId: string;
  imageIds: string[];
}): Promise<ImageStorageResult<{ released: number; deferred: number }>> {
  let claimResult: { data: unknown; error: unknown };
  try {
    claimResult = await input.supabaseAdmin.rpc("claim_board_image_deletions_for_owner", {
      p_owner_user_id: input.ownerUserId,
      p_image_ids: input.imageIds,
      p_now: new Date().toISOString(),
      p_lease_seconds: 300,
    });
  } catch {
    return { ok: false, status: 503 };
  }
  const { data, error } = claimResult;
  if (error) return { ok: false, status: 503 };

  const requestedImageIds = new Set(input.imageIds);
  const claims = getClaimedImages(data, requestedImageIds);
  if (!claims) return { ok: false, status: 503 };
  let released = 0;
  for (const claim of claims) {
    let deleted = false;
    try {
      const { error: removeError } = await input.supabaseAdmin.storage
        .from(claim.bucket_id)
        .remove([claim.storage_key]);
      deleted = !removeError;
    } catch {
      deleted = false;
    }

    let finalized: { data: unknown; error: unknown } | null = null;
    try {
      finalized = await input.supabaseAdmin.rpc("finalize_board_image_deletion", {
        p_image_id: claim.image_id,
        p_lease_token: claim.lease_token,
        p_deleted: deleted,
      });
    } catch {
      finalized = null;
    }
    if (deleted && !finalized?.error && finalized?.data === true) {
      released += 1;
    }
  }
  return { ok: true, data: { released, deferred: requestedImageIds.size - released } };
}

function getReservationResult(value: unknown): { status: 429 } | { status: 200; row: ReservedImageRow } | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const row = value[0];
  if (!isRecord(row) || typeof row.result_code !== "string") return null;
  if (row.result_code === "quota_exceeded") {
    return row.image_id === null && row.bucket_id === null && row.storage_key === null
      ? { status: 429 }
      : null;
  }
  if (row.result_code !== "ok" || typeof row.image_id !== "string" || typeof row.bucket_id !== "string"
    || typeof row.storage_key !== "string" || row.bucket_id !== BOARD_IMAGE_BUCKET
    || !isUuid(row.image_id) || row.storage_key !== row.image_id) return null;
  return {
    status: 200,
    row: { image_id: row.image_id, bucket_id: row.bucket_id, storage_key: row.storage_key },
  };
}

function getClaimedImages(value: unknown, requestedImageIds: Set<string>): ClaimedImageRow[] | null {
  if (!Array.isArray(value) || value.length > requestedImageIds.size) return null;
  const claimedImageIds = new Set<string>();
  const claims: ClaimedImageRow[] = [];
  for (const row of value) {
    if (!isRecord(row) || typeof row.image_id !== "string" || typeof row.bucket_id !== "string"
      || typeof row.storage_key !== "string" || typeof row.lease_token !== "string"
      || row.bucket_id !== BOARD_IMAGE_BUCKET || !isUuid(row.image_id) || !isUuid(row.lease_token)
      || row.storage_key !== row.image_id || !requestedImageIds.has(row.image_id)
      || claimedImageIds.has(row.image_id)) return null;
    claimedImageIds.add(row.image_id);
    claims.push({
      image_id: row.image_id,
      bucket_id: row.bucket_id,
      storage_key: row.storage_key,
      lease_token: row.lease_token,
    });
  }
  return claims;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toBoardImagePublicUrl(bucketId: string, storageKey: string): string {
  const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://supabase.invalid").replace(/\/$/, "");
  return `${baseUrl}/storage/v1/object/public/${bucketId}/${encodeURIComponent(storageKey)}`;
}
