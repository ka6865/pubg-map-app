import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const loadYaml = (createRequire(import.meta.url)("js-yaml") as {
  load(source: string): unknown;
}).load;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

describe("게시판 이미지 전역 cleanup 작업", () => {
  it("전역 claim RPC만 20개씩 최대 5 batch 호출하고 30초 뒤 새 batch를 시작하지 않는다", async () => {
    const scriptPath = resolve("scripts/cleanup_board_images.ts");
    expect(existsSync(scriptPath)).toBe(true);
    if (!existsSync(scriptPath)) return;

    const cleanup = await import("../scripts/cleanup_board_images");
    const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: null }>>()
      .mockResolvedValue({ data: [], error: null });
    const now = new Date("2026-07-22T00:00:00.000Z");

    let elapsedCheck = 0;
    await expect(cleanup.cleanupBoardImages({ rpc } as never, {
      now: () => now,
      nowMs: () => elapsedCheck++ === 0 ? 0 : 30_000,
    })).resolves.toMatchObject({ batches: 0, claimed: 0, finalized: 0 });
    expect(rpc).not.toHaveBeenCalled();

    let currentMs = 0;
    const batch = Array.from({ length: 20 }, (_, index) => ({
      image_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      bucket_id: "board-images-v2",
      storage_key: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      lease_token: `00000000-0000-4000-9000-${String(index).padStart(12, "0")}`,
    }));
    rpc.mockImplementation((name) => Promise.resolve({
      data: name === "claim_board_image_deletions" ? batch : true,
      error: null,
    }));
    const storage = { from: vi.fn(() => ({ remove: vi.fn(async () => ({ error: null })) })) };

    await cleanup.cleanupBoardImages({ rpc, storage } as never, {
      now: () => now,
      nowMs: () => currentMs++,
    });
    expect(rpc).toHaveBeenCalledWith("claim_board_image_deletions", {
      p_limit: 20,
      p_now: now.toISOString(),
      p_lease_seconds: 300,
    });
    expect(rpc.mock.calls.filter(([name]) => name === "claim_board_image_deletions")).toHaveLength(5);
  });

  it("claim SQL 계약은 24시간 전 pending/ready, legacy retained, 참조 객체를 전역 worker에서 제외한다", () => {
    const migration = readFileSync(resolve("supabase/migrations/20260718203104_board_image_storage_ownership.sql"), "utf8");

    expect(migration).toMatch(/status IN \('pending', 'ready'\) AND object_row\.expires_at <= p_now/);
    expect(migration).toContain("'legacy_retained'");
    expect(migration).toMatch(/claim_board_image_deletions\([\s\S]*WHERE \(\(object_row\.status = 'delete_pending'[\s\S]*NOT EXISTS \([\s\S]*ref_row\.image_id = object_row\.id/);
  });

  it("Storage 성공과 number·string 404 not found는 finalize(true), 반환 오류와 throw는 finalize(false)로 순차 처리한다", async () => {
    const cleanup = await import("../scripts/cleanup_board_images");
    const claims = [
      { image_id: "10000000-0000-4000-8000-000000000001", bucket_id: "board-images-v2", storage_key: "10000000-0000-4000-8000-000000000001", lease_token: "20000000-0000-4000-8000-000000000001" },
      { image_id: "10000000-0000-4000-8000-000000000002", bucket_id: "board-images-v2", storage_key: "10000000-0000-4000-8000-000000000002", lease_token: "20000000-0000-4000-8000-000000000002" },
      { image_id: "10000000-0000-4000-8000-000000000003", bucket_id: "board-images-v2", storage_key: "10000000-0000-4000-8000-000000000003", lease_token: "20000000-0000-4000-8000-000000000003" },
      { image_id: "10000000-0000-4000-8000-000000000004", bucket_id: "board-images-v2", storage_key: "10000000-0000-4000-8000-000000000004", lease_token: "20000000-0000-4000-8000-000000000004" },
      { image_id: "10000000-0000-4000-8000-000000000005", bucket_id: "board-images-v2", storage_key: "10000000-0000-4000-8000-000000000005", lease_token: "20000000-0000-4000-8000-000000000005" },
    ];
    const rpc = vi.fn((name: string) => {
      if (name === "claim_board_image_deletions") return Promise.resolve({ data: claims, error: null });
      return Promise.resolve({ data: true, error: null });
    });
    const remove = vi.fn(async (keys: string[]) => {
      if (keys[0] === claims[1].storage_key) return { error: { statusCode: 404 } };
      if (keys[0] === claims[2].storage_key) return { error: { statusCode: "404" } };
      if (keys[0] === claims[3].storage_key) return { error: { statusCode: 500 } };
      if (keys[0] === claims[4].storage_key) throw new Error("raw-storage-error");
      return { error: null };
    });

    await cleanup.cleanupBoardImages({ rpc, storage: { from: vi.fn(() => ({ remove })) } } as never, {
      now: () => new Date("2026-07-22T00:00:00.000Z"),
      nowMs: () => 0,
    });

    expect(remove).toHaveBeenCalledTimes(5);
    const finalizeCalls = rpc.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
    expect(finalizeCalls.filter(([name]) => name === "finalize_board_image_deletion").map(([, args]) => args)).toEqual([
      { p_image_id: claims[0].image_id, p_lease_token: claims[0].lease_token, p_deleted: true },
      { p_image_id: claims[1].image_id, p_lease_token: claims[1].lease_token, p_deleted: true },
      { p_image_id: claims[2].image_id, p_lease_token: claims[2].lease_token, p_deleted: true },
      { p_image_id: claims[3].image_id, p_lease_token: claims[3].lease_token, p_deleted: false },
      { p_image_id: claims[4].image_id, p_lease_token: claims[4].lease_token, p_deleted: false },
    ]);
  });

  it.each([
    ["다른 bucket", { bucket_id: "other-bucket" }],
    ["key 불일치", { storage_key: "30000000-0000-4000-8000-000000000099" }],
    ["image UUID 비정상", { image_id: "not-a-uuid" }],
    ["lease token UUID 비정상", { lease_token: "not-a-uuid" }],
  ])("claim batch에 %s이 있으면 Storage와 finalize 없이 전체를 fail closed한다", async (_caseName, invalidFields) => {
    const cleanup = await import("../scripts/cleanup_board_images");
    const validClaim = {
      image_id: "30000000-0000-4000-8000-000000000001",
      bucket_id: "board-images-v2",
      storage_key: "30000000-0000-4000-8000-000000000001",
      lease_token: "40000000-0000-4000-8000-000000000001",
    };
    const rpc = vi.fn((name: string) => Promise.resolve({
      data: name === "claim_board_image_deletions" ? [validClaim, { ...validClaim, ...invalidFields }] : true,
      error: null,
    }));
    const remove = vi.fn();
    const from = vi.fn(() => ({ remove }));

    await expect(cleanup.cleanupBoardImages({ rpc, storage: { from } } as never, {
      now: () => new Date("2026-07-22T00:00:00.000Z"),
      nowMs: () => 0,
    })).rejects.toThrow("board-image-cleanup-claim-failed");
    expect(from).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(rpc.mock.calls.filter(([name]) => name === "finalize_board_image_deletion")).toHaveLength(0);
  });

  it("claim batch의 중복 image ID는 Storage와 finalize 없이 전체를 fail closed한다", async () => {
    const cleanup = await import("../scripts/cleanup_board_images");
    const claim = {
      image_id: "30000000-0000-4000-8000-000000000001",
      bucket_id: "board-images-v2",
      storage_key: "30000000-0000-4000-8000-000000000001",
      lease_token: "40000000-0000-4000-8000-000000000001",
    };
    const rpc = vi.fn((name: string) => Promise.resolve({
      data: name === "claim_board_image_deletions" ? [claim, { ...claim, lease_token: "40000000-0000-4000-8000-000000000002" }] : true,
      error: null,
    }));
    const remove = vi.fn();
    const from = vi.fn(() => ({ remove }));

    await expect(cleanup.cleanupBoardImages({ rpc, storage: { from } } as never, {
      now: () => new Date("2026-07-22T00:00:00.000Z"),
      nowMs: () => 0,
    })).rejects.toThrow("board-image-cleanup-claim-failed");
    expect(from).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(rpc.mock.calls.filter(([name]) => name === "finalize_board_image_deletion")).toHaveLength(0);
  });

  it("RPC 오류는 fail closed하며 안전 집계 로그에 key, token, raw error를 포함하지 않는다", async () => {
    const cleanup = await import("../scripts/cleanup_board_images");
    const rawError = "raw-error-and-secret";
    const write = vi.fn();

    await expect(cleanup.cleanupBoardImages({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: rawError } }) } as never, {
      now: () => new Date("2026-07-22T00:00:00.000Z"),
      write,
    })).rejects.toThrow("board-image-cleanup-claim-failed");
    expect(write.mock.calls.flat().join(" ")).not.toContain(rawError);
  });

  it("daily maintenance와 독립된 비활성 cleanup job은 timeout과 단일 concurrency를 갖고 기존 secret만 사용한다", () => {
    const parsed = loadYaml(readFileSync(resolve(".github/workflows/daily-tasks.yml"), "utf8"));
    expect(isRecord(parsed) && isRecord(parsed.jobs)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.jobs)) return;
    const job = parsed.jobs["board-image-cleanup"];
    expect(isRecord(job)).toBe(true);
    if (!isRecord(job)) return;
    expect(job.needs).toBeUndefined();
    expect(job.if).toBe("${{ false }}");
    expect(job["timeout-minutes"]).toBeTypeOf("number");
    expect(job.concurrency).toEqual({ group: "board-image-cleanup", "cancel-in-progress": false });
    expect(JSON.stringify(job)).toContain("scripts/cleanup_board_images.ts");
    expect(JSON.stringify(job)).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(JSON.stringify(job)).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
