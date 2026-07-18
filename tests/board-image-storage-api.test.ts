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
        data: [{ image_id: IMAGE_ID, bucket_id: "board-images-v2", storage_key: "server-key" }],
        error: null,
      });
    }
    if (name === "complete_board_image_upload") {
      return Promise.resolve(options?.complete ?? { data: true, error: null });
    }
    if (name === "claim_board_image_deletions_for_owner") {
      return Promise.resolve(options?.claim ?? {
        data: [{ image_id: IMAGE_ID, bucket_id: "board-images-v2", storage_key: "server-key", lease_token: LEASE_TOKEN }],
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

    const response = await reservePOST(request("/api/board/images/reserve", { mimeType: "image/png", byteSize: 10 }));

    expect(response.status).toBe(200);
    expect(admin.from).toHaveBeenCalledWith("board-images-v2");
    expect(admin.createSignedUploadUrl).toHaveBeenCalledWith("server-key", { upsert: false });
    expect(await response.json()).toEqual({
      imageId: IMAGE_ID,
      bucketId: "board-images-v2",
      storageKey: "server-key",
      token: "signed-secret-token",
      publicUrl: expect.stringContaining("/storage/v1/object/public/board-images-v2/server-key"),
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
});
