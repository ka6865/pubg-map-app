import {
  BOARD_IMAGE_BUCKET,
  type BoardImageMimeType,
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
  | { ok: false; status: 404 | 503 };

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
  const reservation = await input.supabaseAdmin.rpc("reserve_board_image_upload", {
    p_owner_user_id: input.ownerUserId,
    p_expected_mime_type: input.mimeType,
    p_max_bytes: input.byteSize,
  });
  const row = getFirstReservedImage(reservation.data);
  if (reservation.error || !row) return { ok: false, status: 503 };

  const { data: signed, error } = await input.supabaseAdmin.storage
    .from(BOARD_IMAGE_BUCKET)
    .createSignedUploadUrl(row.storage_key, { upsert: false });
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
  const { data, error } = await input.supabaseAdmin.rpc("complete_board_image_upload", {
    p_image_id: input.imageId,
    p_owner_user_id: input.ownerUserId,
  });
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
  const { data, error } = await input.supabaseAdmin.rpc("claim_board_image_deletions_for_owner", {
    p_owner_user_id: input.ownerUserId,
    p_image_ids: input.imageIds,
    p_now: new Date().toISOString(),
    p_lease_seconds: 300,
  });
  if (error) return { ok: false, status: 503 };

  const claims = getClaimedImages(data);
  let released = 0;
  let deferred = 0;
  for (const claim of claims) {
    const { error: removeError } = await input.supabaseAdmin.storage
      .from(claim.bucket_id)
      .remove([claim.storage_key]);
    const deleted = !removeError;
    const finalized = await input.supabaseAdmin.rpc("finalize_board_image_deletion", {
      p_image_id: claim.image_id,
      p_lease_token: claim.lease_token,
      p_deleted: deleted,
    });

    if (deleted && !finalized.error && finalized.data === true) {
      released += 1;
    } else {
      deferred += 1;
    }
  }
  return { ok: true, data: { released, deferred } };
}

function getFirstReservedImage(value: unknown): ReservedImageRow | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const row = value[0];
  if (!isRecord(row) || typeof row.image_id !== "string" || typeof row.bucket_id !== "string"
    || typeof row.storage_key !== "string") return null;
  return { image_id: row.image_id, bucket_id: row.bucket_id, storage_key: row.storage_key };
}

function getClaimedImages(value: unknown): ClaimedImageRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!isRecord(row) || typeof row.image_id !== "string" || typeof row.bucket_id !== "string"
      || typeof row.storage_key !== "string" || typeof row.lease_token !== "string") return [];
    return [{
      image_id: row.image_id,
      bucket_id: row.bucket_id,
      storage_key: row.storage_key,
      lease_token: row.lease_token,
    }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toBoardImagePublicUrl(bucketId: string, storageKey: string): string {
  const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://supabase.invalid").replace(/\/$/, "");
  return `${baseUrl}/storage/v1/object/public/${bucketId}/${encodeURIComponent(storageKey)}`;
}
