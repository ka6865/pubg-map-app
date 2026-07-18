import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildTelemetryObjectInventoryArchive,
  fetchAllRowsByRange,
  runTelemetryStorageCleanup,
  type TelemetryCleanupDependencies,
  type TelemetryCleanupRegistryRow,
} from "../scripts/cleanup_telemetry";

function createDependencies(
  overrides: Partial<TelemetryCleanupDependencies> = {},
): TelemetryCleanupDependencies {
  return {
    listMasterRows: vi.fn().mockResolvedValue([]),
    listRegistryRows: vi.fn().mockResolvedValue([]),
    archiveObjectInventory: vi.fn().mockResolvedValue(undefined),
    cleanupExpiredMatches: vi.fn(async (matchIds: string[]) => matchIds),
    now: () => new Date("2026-07-18T00:00:00.000Z"),
    ...overrides,
  };
}

describe("telemetry cleanup registry", () => {
  it("Supabase 1000행 제한을 넘는 조회를 범위별로 끝까지 수집한다", async () => {
    const rows = Array.from({ length: 1_001 }, (_, index) => ({ id: index + 1 }));
    const ranges: Array<[number, number]> = [];

    const result = await fetchAllRowsByRange(async (from, to) => {
      ranges.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    }, 500);

    expect(result).toHaveLength(1_001);
    expect(ranges).toEqual([
      [0, 499],
      [500, 999],
      [1_000, 1_499],
    ]);
  });

  it("Supabase가 error 없이 null data를 반환해도 fail-closed한다", async () => {
    await expect(fetchAllRowsByRange(async () => ({
      data: null,
      error: null,
    }))).rejects.toThrow("telemetry-cleanup-page-data-missing");
  });

  it("master 전체 조회가 실패하면 RPC를 시작하지 않는다", async () => {
    const cleanupExpiredMatches = vi.fn().mockResolvedValue([]);
    const dependencies = createDependencies({
      listMasterRows: vi.fn().mockRejectedValue(new Error("master-unavailable")),
      cleanupExpiredMatches,
    });

    await expect(runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
    }, dependencies)).rejects.toThrow("master-unavailable");

    expect(cleanupExpiredMatches).not.toHaveBeenCalled();
  });

  it("만료 match DB는 원자적 RPC로 정리하고 R2 삭제는 보류한다", async () => {
    const cleanupExpiredMatches = vi.fn().mockResolvedValue(["m1"]);
    const cutoff = new Date("2026-07-17T00:00:00.000Z");
    const dependencies = createDependencies({
      listMasterRows: vi.fn().mockResolvedValue([
        {
          match_id: "m1",
          storage_path: "master/m1.json",
          telemetry_version: 58,
          created_at: "2026-07-01T00:00:00.000Z",
        },
        {
          match_id: "m2",
          storage_path: "master/m2.json",
          telemetry_version: 60,
          created_at: "2026-07-18T00:00:00.000Z",
        },
      ]),
      cleanupExpiredMatches,
    });

    const result = await runTelemetryStorageCleanup({
      cutoff,
      targetVersion: 59,
    }, dependencies);

    expect(cleanupExpiredMatches).toHaveBeenCalledWith(["m1"], cutoff, 59);
    expect(result).toEqual({
      deletedMatchCount: 1,
      archivedObjectCount: 0,
      inventoryManifestCount: 0,
      r2DeletionDeferred: true,
    });
  });

  it("master 없는 만료 registry를 R2 manifest에 먼저 보관한 뒤 DB cleanup에 전달한다", async () => {
    const registryRow: TelemetryCleanupRegistryRow = {
      match_id: "registry-only",
      storage_path: "telemetry-map/v60/steam/registry-only/player/lite.json",
      status: "ready",
      lease_expires_at: null,
      updated_at: "2026-07-01T00:00:00.000Z",
    };
    const archiveObjectInventory = vi.fn().mockResolvedValue(undefined);
    const cleanupExpiredMatches = vi.fn().mockResolvedValue(["registry-only"]);

    const result = await runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
    }, createDependencies({
      listRegistryRows: vi.fn().mockResolvedValue([registryRow]),
      archiveObjectInventory,
      cleanupExpiredMatches,
    }));

    expect(archiveObjectInventory).toHaveBeenCalledWith([registryRow]);
    expect(cleanupExpiredMatches).toHaveBeenCalledWith(
      ["registry-only"],
      new Date("2026-07-17T00:00:00.000Z"),
      59,
    );
    expect(archiveObjectInventory.mock.invocationCallOrder[0])
      .toBeLessThan(cleanupExpiredMatches.mock.invocationCallOrder[0]);
    expect(result).toEqual({
      deletedMatchCount: 1,
      archivedObjectCount: 1,
      inventoryManifestCount: 1,
      r2DeletionDeferred: true,
    });
  });

  it("inventory manifest는 입력 순서와 무관한 결정적 key를 사용한다", () => {
    const rows: TelemetryCleanupRegistryRow[] = [
      {
        match_id: "m2",
        storage_path: "telemetry-map/b.json",
        status: "ready",
        lease_expires_at: null,
        updated_at: "2026-07-01T00:00:00.000Z",
      },
      {
        match_id: "m1",
        storage_path: "telemetry-map/a.json",
        status: "ready",
        lease_expires_at: null,
        updated_at: "2026-07-01T00:00:00.000Z",
      },
    ];

    const forward = buildTelemetryObjectInventoryArchive(rows);
    const reversed = buildTelemetryObjectInventoryArchive([...rows].reverse());

    expect(forward).toEqual(reversed);
    expect(forward.storagePath).toMatch(/^telemetry-inventory\/v1\/[a-f0-9]{64}\.json$/);
  });

  it("inventory manifest 저장 실패 시 registry cleanup RPC를 호출하지 않는다", async () => {
    const cleanupExpiredMatches = vi.fn().mockResolvedValue(["registry-only"]);
    await expect(runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
    }, createDependencies({
      listRegistryRows: vi.fn().mockResolvedValue([{
        match_id: "registry-only",
        storage_path: "telemetry-map/registry-only.json",
        status: "ready",
        lease_expires_at: null,
        updated_at: "2026-07-01T00:00:00.000Z",
      }]),
      archiveObjectInventory: vi.fn().mockRejectedValue(new Error("r2 unavailable")),
      cleanupExpiredMatches,
    }))).rejects.toThrow("r2 unavailable");
    expect(cleanupExpiredMatches).not.toHaveBeenCalled();
  });

  it("활성 pending lease는 registry-only cleanup 후보에서 제외한다", async () => {
    const cleanupExpiredMatches = vi.fn().mockResolvedValue([]);
    const archiveObjectInventory = vi.fn().mockResolvedValue(undefined);

    await runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
    }, createDependencies({
      listRegistryRows: vi.fn().mockResolvedValue([{
        match_id: "writer-active",
        storage_path: "telemetry-map/writer-active.json",
        status: "pending",
        lease_expires_at: "2026-07-18T00:15:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
      }]),
      archiveObjectInventory,
      cleanupExpiredMatches,
    }));

    expect(archiveObjectInventory).not.toHaveBeenCalled();
    expect(cleanupExpiredMatches).not.toHaveBeenCalled();
  });

  it("lease가 만료된 pending row는 updated_at이 cutoff 이후여도 inventory와 cleanup 후보에 포함한다", async () => {
    const registryRow: TelemetryCleanupRegistryRow = {
      match_id: "expired-writer",
      storage_path: "telemetry-map/expired-writer.json",
      status: "pending",
      lease_expires_at: "2026-07-17T23:59:00.000Z",
      updated_at: "2026-07-17T12:00:00.000Z",
    };
    const archiveObjectInventory = vi.fn().mockResolvedValue(undefined);
    const cleanupExpiredMatches = vi.fn().mockResolvedValue(["expired-writer"]);

    const result = await runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
    }, createDependencies({
      listMasterRows: vi.fn().mockResolvedValue([{
        match_id: "expired-writer",
        storage_path: "old/master.json",
        telemetry_version: 58,
        created_at: "2026-07-01T00:00:00.000Z",
      }]),
      listRegistryRows: vi.fn().mockResolvedValue([registryRow]),
      archiveObjectInventory,
      cleanupExpiredMatches,
    }));

    expect(archiveObjectInventory).toHaveBeenCalledWith([registryRow]);
    expect(cleanupExpiredMatches).toHaveBeenCalledOnce();
    expect(result.archivedObjectCount).toBe(1);
  });

  it("archive 후보가 많아도 실제 cleanup 완료 match의 object만 완료 counter에 포함한다", async () => {
    const rows: TelemetryCleanupRegistryRow[] = ["cleaned", "protected"].map((matchId) => ({
      match_id: matchId,
      storage_path: `telemetry-map/${matchId}.json`,
      status: "ready" as const,
      lease_expires_at: null,
      updated_at: "2026-07-01T00:00:00.000Z",
    }));

    const result = await runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
    }, createDependencies({
      listRegistryRows: vi.fn().mockResolvedValue(rows),
      cleanupExpiredMatches: vi.fn().mockResolvedValue(["cleaned"]),
    }));

    expect(result).toMatchObject({
      deletedMatchCount: 1,
      archivedObjectCount: 1,
      inventoryManifestCount: 1,
    });
  });

  it("50개를 넘는 만료 match를 RPC 입력 상한에 맞게 나눈다", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      match_id: `m${index}`,
      storage_path: `master/m${index}.json`,
      telemetry_version: 58,
      created_at: "2026-07-01T00:00:00.000Z",
    }));
    const cleanupExpiredMatches = vi.fn(async (matchIds: string[]) => matchIds);

    const result = await runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
    }, createDependencies({
      listMasterRows: vi.fn().mockResolvedValue(rows),
      cleanupExpiredMatches,
    }));

    expect(cleanupExpiredMatches).toHaveBeenCalledTimes(2);
    expect(cleanupExpiredMatches.mock.calls[0]?.[0]).toHaveLength(50);
    expect(cleanupExpiredMatches.mock.calls[1]?.[0]).toHaveLength(1);
    expect(result.deletedMatchCount).toBe(51);
  });

  it("cleanup RPC가 실패하면 후속 batch를 중단한다", async () => {
    const dependencies = createDependencies({
      listMasterRows: vi.fn().mockResolvedValue([{
        match_id: "m1",
        storage_path: "master/m1.json",
        telemetry_version: 58,
        created_at: "2026-07-01T00:00:00.000Z",
      }]),
      cleanupExpiredMatches: vi.fn().mockRejectedValue(new Error("cleanup-rpc-failure")),
    });

    await expect(runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
    }, dependencies)).rejects.toThrow("cleanup-rpc-failure");
  });

  it("RPC가 최근 registry writer를 확인해 제외한 match는 삭제 카운트에 포함하지 않는다", async () => {
    const dependencies = createDependencies({
      listMasterRows: vi.fn().mockResolvedValue([{
        match_id: "m1",
        storage_path: "master/m1.json",
        telemetry_version: 58,
        created_at: "2026-07-01T00:00:00.000Z",
      }]),
      cleanupExpiredMatches: vi.fn().mockResolvedValue([]),
    });

    const result = await runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
    }, dependencies);

    expect(result.deletedMatchCount).toBe(0);
  });

  it("cleanup RPC가 요청하지 않은 match를 반환하면 계약 오류로 중단한다", async () => {
    const dependencies = createDependencies({
      listMasterRows: vi.fn().mockResolvedValue([{
        match_id: "m1",
        storage_path: "master/m1.json",
        telemetry_version: 58,
        created_at: "2026-07-01T00:00:00.000Z",
      }]),
      cleanupExpiredMatches: vi.fn().mockResolvedValue(["m2"]),
    });

    await expect(runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
    }, dependencies)).rejects.toThrow("telemetry-cleanup-invalid-rpc-result");
  });

  it("마이그레이션이 writer를 table lock·cutoff 재검증·순차 삭제로 보호한다", () => {
    const migration = fs.readFileSync(path.resolve(
      "supabase/migrations/20260718152309_telemetry_map_cache_entries.sql",
    ), "utf8");

    expect(migration).toContain("cleanup_expired_telemetry_matches");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("lock table public.telemetry_map_cache_entries");
    expect(migration).toContain("in share row exclusive mode");
    expect(migration).toContain("cache.updated_at >= p_cutoff");
    expect(migration).toContain("cache.updated_at < p_cutoff");
    expect(migration).toContain("lease_expires_at >= statement_timestamp()");
    expect(migration).toContain("lease_expires_at < statement_timestamp()");
    expect(migration).toContain("telemetry-cleanup-postcondition-failed");
    expect(migration).toContain("master.match_id is null");
    expect(migration).toContain("not exists");
    expect(migration).toContain("delete from public.match_stats_raw");
    expect(migration).toContain("delete from public.processed_match_telemetry");
    expect(migration).toContain("delete from public.telemetry_map_cache_entries");
    expect(migration).toContain("delete from public.match_master_telemetry");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("cleanup script는 import 시 실행하지 않고 direct-run guard만 사용한다", () => {
    const source = fs.readFileSync(path.resolve("scripts/cleanup_telemetry.ts"), "utf8");
    expect(source).toContain("pathToFileURL(resolve(process.argv[1])).href === import.meta.url");
    expect(source).toContain("if (isDirectRun)");
    expect(source).not.toMatch(/\nsmartCleanup\(\)\.catch/);
    expect(source).not.toMatch(/process\.exit\(/);
    expect(source).not.toContain("deleteMultipleFromR2");
    expect(source).not.toContain("listR2Files");
  });
});
