import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withAuthGuard: vi.fn(),
}));

vi.mock("../utils/supabase/guard", () => ({
  withAuthGuard: mocks.withAuthGuard,
}));

import { POST as reservePOST } from "../app/api/board/images/reserve/route";
import { POST as completePOST } from "../app/api/board/images/complete/route";
import { POST as releasePOST } from "../app/api/board/images/release/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const IMAGE_ID = "22222222-2222-4222-8222-222222222222";
const LEASE_TOKEN = "33333333-3333-4333-8333-333333333333";
const SECOND_IMAGE_ID = "44444444-4444-4444-8444-444444444444";
const THIRD_IMAGE_ID = "55555555-5555-4555-8555-555555555555";

function request(path: string, body: unknown) {
  return new Request(`https://bgms.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createAdmin(options?: {
  reserve?: { data: unknown; error: unknown };
  complete?: { data: unknown; error: unknown };
  claim?: { data: unknown; error: unknown };
  finalize?: { data: unknown; error: unknown };
  signed?: { data: unknown; error: unknown };
  remove?: { error: unknown };
}) {
  const rpc = vi.fn((name: string) => {
    if (name === "reserve_board_image_upload") {
      return Promise.resolve(options?.reserve ?? {
        data: [{ result_code: "ok", image_id: IMAGE_ID, bucket_id: "board-images-v2", storage_key: IMAGE_ID }],
        error: null,
      });
    }
    if (name === "complete_board_image_upload") {
      return Promise.resolve(options?.complete ?? { data: true, error: null });
    }
    if (name === "claim_board_image_deletions_for_owner") {
      return Promise.resolve(options?.claim ?? {
        data: [{ image_id: IMAGE_ID, bucket_id: "board-images-v2", storage_key: IMAGE_ID, lease_token: LEASE_TOKEN }],
        error: null,
      });
    }
    if (name === "finalize_board_image_deletion") {
      return Promise.resolve(options?.finalize ?? { data: true, error: null });
    }
    throw new Error(`unexpected RPC: ${name}`);
  });
  const createSignedUploadUrl = vi.fn(async () => options?.signed ?? {
    data: { token: "signed-secret-token" },
    error: null,
  });
  const remove = vi.fn(async () => options?.remove ?? { error: null });
  const from = vi.fn(() => ({ createSignedUploadUrl, remove }));
  return { supabaseAdmin: { rpc, storage: { from } }, rpc, from, createSignedUploadUrl, remove };
}

describe("게시판 이미지 signed upload API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["reserve", reservePOST, "/api/board/images/reserve", { mimeType: "image/png", byteSize: 1 }],
    ["complete", completePOST, "/api/board/images/complete", { imageId: IMAGE_ID }],
    ["release", releasePOST, "/api/board/images/release", { imageIds: [IMAGE_ID] }],
  ])("무인증 %s 요청은 401", async (_name, handler, path, body) => {
    mocks.withAuthGuard.mockResolvedValue({ error: new Response(null, { status: 401 }) });

    expect((await handler(request(path, body))).status).toBe(401);
  });

  it.each([
    ["MIME 미지원", { mimeType: "image/gif", byteSize: 1 }],
    ["최대 크기 초과", { mimeType: "image/png", byteSize: 1_572_865 }],
    ["0 byte", { mimeType: "image/png", byteSize: 0 }],
    ["추가 필드", { mimeType: "image/png", byteSize: 1, ownerUserId: USER_ID }],
  ])("reserve는 %s body를 인증 전에 400으로 거부한다", async (_name, body) => {
    const response = await reservePOST(request("/api/board/images/reserve", body));

    expect(response.status).toBe(400);
    expect(mocks.withAuthGuard).not.toHaveBeenCalled();
  });

  it("reserve는 DB가 반환한 key로만 upsert false signed upload를 만든다", async () => {
    const admin = createAdmin();
    mocks.withAuthGuard.mockResolvedValue({ user: { id: USER_ID }, supabaseAdmin: admin.supabaseAdmin });

    const response = await reservePOST(request("/api/board/images/reserve", { mimeType: "image/png", byteSize: 1 }));

    expect(response.status).toBe(200);
    expect(admin.rpc).toHaveBeenCalledWith("reserve_board_image_upload", {
      p_owner_user_id: USER_ID,
      p_expected_mime_type: "image/png",
      p_max_bytes: 1_572_864,
    });
    expect(admin.from).toHaveBeenCalledWith("board-images-v2");
    expect(admin.createSignedUploadUrl).toHaveBeenCalledWith(IMAGE_ID, { upsert: false });
    expect(await response.json()).toEqual({
      imageId: IMAGE_ID,
      bucketId: "board-images-v2",
      storageKey: IMAGE_ID,
      token: "signed-secret-token",
      publicUrl: expect.stringContaining(`/storage/v1/object/public/board-images-v2/${IMAGE_ID}`),
    });
  });

  it("reserve의 signed token 및 원본 storage 오류는 응답에 노출하지 않는다", async () => {
    const admin = createAdmin({ signed: { data: { token: "signed-secret-token" }, error: { message: "raw-storage-error" } } });
    mocks.withAuthGuard.mockResolvedValue({ user: { id: USER_ID }, supabaseAdmin: admin.supabaseAdmin });

    const response = await reservePOST(request("/api/board/images/reserve", { mimeType: "image/png", byteSize: 10 }));
    const payload = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(payload).not.toContain("signed-secret-token");
    expect(payload).not.toContain("raw-storage-error");
  });

  it.each([
    ["다른 bucket", { result_code: "ok", image_id: IMAGE_ID, bucket_id: "other-bucket", storage_key: IMAGE_ID }],
    ["UUID가 아닌 image_id", { result_code: "ok", image_id: "not-a-uuid", bucket_id: "board-images-v2", storage_key: "not-a-uuid" }],
    ["image_id와 다른 storage_key", { result_code: "ok", image_id: IMAGE_ID, bucket_id: "board-images-v2", storage_key: "other-key" }],
  ])("reserve는 RPC 반환 %s 계약 위반 시 signed URL을 생성하지 않고 503을 반환한다", async (_name, row) => {
    const admin = createAdmin({ reserve: { data: [row], error: null } });
    mocks.withAuthGuard.mockResolvedValue({ user: { id: USER_ID }, supabaseAdmin: admin.supabaseAdmin });

    const response = await reservePOST(request("/api/board/images/reserve", { mimeType: "image/png", byteSize: 10 }));

    expect(response.status).toBe(503);
    expect(admin.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("reserve는 quota_exceeded의 null 단일 행을 429 고정 오류로 반환하고 signed URL을 만들지 않는다", async () => {
    const admin = createAdmin({ reserve: {
      data: [{ result_code: "quota_exceeded", image_id: null, bucket_id: null, storage_key: null }],
      error: null,
    } });
    mocks.withAuthGuard.mockResolvedValue({ user: { id: USER_ID }, supabaseAdmin: admin.supabaseAdmin });

    const response = await reservePOST(request("/api/board/images/reserve", { mimeType: "image/png", byteSize: 10 }));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "이미지 업로드 한도를 초과했습니다." });
    expect(admin.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it.each([
    ["알 수 없는 result_code", { result_code: "unexpected", image_id: IMAGE_ID, bucket_id: "board-images-v2", storage_key: IMAGE_ID }],
    ["값이 포함된 quota_exceeded", { result_code: "quota_exceeded", image_id: IMAGE_ID, bucket_id: null, storage_key: null }],
    ["식별자가 없는 ok", { result_code: "ok", image_id: null, bucket_id: null, storage_key: null }],
  ])("reserve는 %s 계약 위반 시 signed URL을 생성하지 않고 503을 반환한다", async (_name, row) => {
    const admin = createAdmin({ reserve: { data: [row], error: null } });
    mocks.withAuthGuard.mockResolvedValue({ user: { id: USER_ID }, supabaseAdmin: admin.supabaseAdmin });

    const response = await reservePOST(request("/api/board/images/reserve", { mimeType: "image/png", byteSize: 10 }));

    expect(response.status).toBe(503);
    expect(admin.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("reserve RPC 예외는 원문을 노출하지 않는 503으로 고정한다", async () => {
    const admin = createAdmin();
    admin.rpc.mockImplementation(() => Promise.reject(new Error("raw-reserve-error")));
    mocks.withAuthGuard.mockResolvedValue({ user: { id: USER_ID }, supabaseAdmin: admin.supabaseAdmin });

    const response = await reservePOST(request("/api/board/images/reserve", { mimeType: "image/png", byteSize: 10 }));

    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("raw-reserve-error");
  });

  it("complete는 storage 검증 RPC 성공일 때만 public URL을 반환한다", async () => {
    const admin = createAdmin({ complete: { data: false, error: null } });
    mocks.withAuthGuard.mockResolvedValue({ user: { id: USER_ID }, supabaseAdmin: admin.supabaseAdmin });

    const response = await completePOST(request("/api/board/images/complete", { imageId: IMAGE_ID }));

    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain("publicUrl");
    expect(admin.rpc).toHaveBeenCalledWith("complete_board_image_upload", {
      p_image_id: IMAGE_ID,
      p_owner_user_id: USER_ID,
    });
  });

  it("complete RPC 예외는 원문을 노출하지 않는 503으로 고정한다", async () => {
    const admin = createAdmin();
    admin.rpc.mockImplementation(() => Promise.reject(new Error("raw-complete-error")));
    mocks.withAuthGuard.mockResolvedValue({ user: { id: USER_ID }, supabaseAdmin: admin.supabaseAdmin });

    const response = await completePOST(request("/api/board/images/complete", { imageId: IMAGE_ID }));

    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("raw-complete-error");
  });

  it("release는 20개 초과 또는 UUID 외 imageId를 인증 전에 400으로 거부한다", async () => {
    const tooMany = Array.from({ length: 21 }, () => IMAGE_ID);

    expect((await releasePOST(request("/api/board/images/release", { imageIds: tooMany }))).status).toBe(400);
    expect((await releasePOST(request("/api/board/images/release", { imageIds: ["not-a-uuid"] }))).status).toBe(400);
    expect(mocks.withAuthGuard).not.toHaveBeenCalled();
  });

  it("release는 storage remove 오류에서 finalize(false), 성공에서 finalize(true)를 호출한다", async () => {
    const failed = createAdmin({ remove: { error: { message: "raw-remove-error" } } });
    mocks.withAuthGuard.mockResolvedValueOnce({ user: { id: USER_ID }, supabaseAdmin: failed.supabaseAdmin });
    const failedResponse = await releasePOST(request("/api/board/images/release", { imageIds: [IMAGE_ID] }));

    expect(failedResponse.status).toBe(200);
    expect(failed.rpc).toHaveBeenLastCalledWith("finalize_board_image_deletion", {
      p_image_id: IMAGE_ID,
      p_lease_token: LEASE_TOKEN,
      p_deleted: false,
    });

    const succeeded = createAdmin();
    mocks.withAuthGuard.mockResolvedValueOnce({ user: { id: USER_ID }, supabaseAdmin: succeeded.supabaseAdmin });
    await releasePOST(request("/api/board/images/release", { imageIds: [IMAGE_ID] }));

    expect(succeeded.rpc).toHaveBeenLastCalledWith("finalize_board_image_deletion", {
      p_image_id: IMAGE_ID,
      p_lease_token: LEASE_TOKEN,
      p_deleted: true,
    });
  });

  it("release는 DB claim 실패 또는 빈 claim이면 storage remove를 호출하지 않는다", async () => {
    const failed = createAdmin({ claim: { data: null, error: { message: "raw-claim-error" } } });
    mocks.withAuthGuard.mockResolvedValueOnce({ user: { id: USER_ID }, supabaseAdmin: failed.supabaseAdmin });
    expect((await releasePOST(request("/api/board/images/release", { imageIds: [IMAGE_ID] }))).status).toBe(503);
    expect(failed.remove).not.toHaveBeenCalled();

    const empty = createAdmin({ claim: { data: [], error: null } });
    mocks.withAuthGuard.mockResolvedValueOnce({ user: { id: USER_ID }, supabaseAdmin: empty.supabaseAdmin });
    expect((await releasePOST(request("/api/board/images/release", { imageIds: [IMAGE_ID] }))).status).toBe(200);
    expect(empty.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["다른 bucket", { image_id: IMAGE_ID, bucket_id: "other-bucket", storage_key: IMAGE_ID, lease_token: LEASE_TOKEN }],
    ["요청에 없는 image_id", { image_id: SECOND_IMAGE_ID, bucket_id: "board-images-v2", storage_key: SECOND_IMAGE_ID, lease_token: LEASE_TOKEN }],
    ["image_id와 다른 storage_key", { image_id: IMAGE_ID, bucket_id: "board-images-v2", storage_key: "other-key", lease_token: LEASE_TOKEN }],
    ["UUID가 아닌 lease token", { image_id: IMAGE_ID, bucket_id: "board-images-v2", storage_key: IMAGE_ID, lease_token: "not-a-uuid" }],
  ])("release는 claim 반환 %s 계약 위반 시 storage remove 없이 503을 반환한다", async (_name, claim) => {
    const admin = createAdmin({ claim: { data: [claim], error: null } });
    mocks.withAuthGuard.mockResolvedValue({ user: { id: USER_ID }, supabaseAdmin: admin.supabaseAdmin });

    const response = await releasePOST(request("/api/board/images/release", { imageIds: [IMAGE_ID] }));

    expect(response.status).toBe(503);
    expect(admin.remove).not.toHaveBeenCalled();
  });

  it("release는 중복 claim 계약 위반 시 storage remove 없이 503을 반환한다", async () => {
    const claim = { image_id: IMAGE_ID, bucket_id: "board-images-v2", storage_key: IMAGE_ID, lease_token: LEASE_TOKEN };
    const admin = createAdmin({ claim: { data: [claim, claim], error: null } });
    mocks.withAuthGuard.mockResolvedValue({ user: { id: USER_ID }, supabaseAdmin: admin.supabaseAdmin });

    const response = await releasePOST(request("/api/board/images/release", { imageIds: [IMAGE_ID] }));

    expect(response.status).toBe(503);
    expect(admin.remove).not.toHaveBeenCalled();
  });

  it("release는 claim 및 remove 예외를 원문 없이 처리하고 remove 예외에도 finalize(false)를 시도한다", async () => {
    const claimFailure = createAdmin();
    claimFailure.rpc.mockImplementation(() => Promise.reject(new Error("raw-claim-error")));
    mocks.withAuthGuard.mockResolvedValueOnce({ user: { id: USER_ID }, supabaseAdmin: claimFailure.supabaseAdmin });
    const claimResponse = await releasePOST(request("/api/board/images/release", { imageIds: [IMAGE_ID] }));

    expect(claimResponse.status).toBe(503);
    expect(JSON.stringify(await claimResponse.json())).not.toContain("raw-claim-error");

    const removeFailure = createAdmin();
    removeFailure.remove.mockRejectedValue(new Error("raw-remove-error"));
    mocks.withAuthGuard.mockResolvedValueOnce({ user: { id: USER_ID }, supabaseAdmin: removeFailure.supabaseAdmin });
    const removeResponse = await releasePOST(request("/api/board/images/release", { imageIds: [IMAGE_ID] }));

    expect(removeResponse.status).toBe(200);
    expect(removeFailure.rpc).toHaveBeenLastCalledWith("finalize_board_image_deletion", {
      p_image_id: IMAGE_ID,
      p_lease_token: LEASE_TOKEN,
      p_deleted: false,
    });
  });

  it("release는 타 소유자 등을 포함해 성공 finalize된 삭제 외 모든 고유 요청을 200 deferred로 반환한다", async () => {
    const admin = createAdmin({ claim: {
      data: [{ image_id: IMAGE_ID, bucket_id: "board-images-v2", storage_key: IMAGE_ID, lease_token: LEASE_TOKEN }],
      error: null,
    } });
    mocks.withAuthGuard.mockResolvedValue({ user: { id: USER_ID }, supabaseAdmin: admin.supabaseAdmin });

    const response = await releasePOST(request("/api/board/images/release", {
      imageIds: [IMAGE_ID, IMAGE_ID, SECOND_IMAGE_ID, THIRD_IMAGE_ID],
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ released: 1, deferred: 2 });
  });
});
