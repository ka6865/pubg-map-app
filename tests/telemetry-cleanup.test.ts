import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  mergeActiveTelemetryPaths,
  selectTelemetryCachePathsForMatches,
} from "../lib/pubg-analysis/telemetryCleanup";
import {
  fetchAllRowsByRange,
  runTelemetryStorageCleanup,
  type TelemetryCleanupDependencies,
} from "../scripts/cleanup_telemetry";

function createDependencies(
  overrides: Partial<TelemetryCleanupDependencies> = {},
): TelemetryCleanupDependencies {
  return {
    isR2Configured: vi.fn().mockReturnValue(true),
    listMasterRows: vi.fn().mockResolvedValue([]),
    listCacheRows: vi.fn().mockResolvedValue([]),
    listR2Files: vi.fn().mockResolvedValue([]),
    deleteR2Paths: vi.fn().mockResolvedValue(undefined),
    cleanupExpiredMatches: vi.fn(async (matchIds: string[]) => matchIds),
    ...overrides,
  };
}

describe("telemetry cleanup registry", () => {
  it("master와 player cache registry 경로를 모두 활성 경로로 보존한다", () => {
    expect([...mergeActiveTelemetryPaths(
      [{ storage_path: "legacy/master.json" }],
      [{ storage_path: "telemetry-map/v60/steam/match/a/lite.json" }],
    )]).toEqual([
      "legacy/master.json",
      "telemetry-map/v60/steam/match/a/lite.json",
    ]);
  });

  it("만료 match에 연결된 모든 player/mode 경로를 선택한다", () => {
    expect(selectTelemetryCachePathsForMatches([
      { match_id: "m1", storage_path: "m1/player-a/lite.json" },
      { match_id: "m1", storage_path: "m1/player-b/full.json" },
      { match_id: "m2", storage_path: "m2/player-c/lite.json" },
    ], ["m1"])).toEqual([
      "m1/player-a/lite.json",
      "m1/player-b/full.json",
    ]);
  });

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

  it("registry 전체 조회가 실패하면 어떤 삭제도 시작하지 않는다", async () => {
    const deleteR2Paths = vi.fn().mockResolvedValue(undefined);
    const cleanupExpiredMatches = vi.fn().mockResolvedValue([]);
    const dependencies = createDependencies({
      listCacheRows: vi.fn().mockRejectedValue(new Error("registry-unavailable")),
      deleteR2Paths,
      cleanupExpiredMatches,
    });

    await expect(runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
      r2ScanLimit: 1_000,
    }, dependencies)).rejects.toThrow("registry-unavailable");

    expect(deleteR2Paths).not.toHaveBeenCalled();
    expect(cleanupExpiredMatches).not.toHaveBeenCalled();
  });

  it("R2 필수 설정이 없으면 모든 조회와 삭제 전에 fail-closed한다", async () => {
    const dependencies = createDependencies({
      isR2Configured: vi.fn().mockReturnValue(false),
    });

    await expect(runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
      r2ScanLimit: 1_000,
    }, dependencies)).rejects.toThrow("telemetry-cleanup-r2-not-configured");

    expect(dependencies.listMasterRows).not.toHaveBeenCalled();
    expect(dependencies.listCacheRows).not.toHaveBeenCalled();
    expect(dependencies.listR2Files).not.toHaveBeenCalled();
    expect(dependencies.deleteR2Paths).not.toHaveBeenCalled();
    expect(dependencies.cleanupExpiredMatches).not.toHaveBeenCalled();
  });

  it("만료 match DB는 원자적 RPC로 정리하고 R2는 다음 orphan 주기까지 보존한다", async () => {
    const deleteR2Paths = vi.fn().mockResolvedValue(undefined);
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
      listCacheRows: vi.fn().mockResolvedValue([
        { match_id: "m1", storage_path: "map/m1/player-a/lite.json" },
        { match_id: "m1", storage_path: "map/m1/player-b/full.json" },
        { match_id: "m2", storage_path: "map/m2/player-c/lite.json" },
      ]),
      listR2Files: vi.fn().mockResolvedValue([
        { key: "master/m1.json", size: 10, lastModified: new Date("2026-07-01T00:00:00.000Z") },
        { key: "map/m1/player-a/lite.json", size: 10, lastModified: new Date("2026-07-01T00:00:00.000Z") },
        { key: "map/m1/player-b/full.json", size: 10, lastModified: new Date("2026-07-01T00:00:00.000Z") },
        { key: "master/m2.json", size: 10, lastModified: new Date("2026-07-01T00:00:00.000Z") },
        { key: "map/m2/player-c/lite.json", size: 10, lastModified: new Date("2026-07-01T00:00:00.000Z") },
      ]),
      deleteR2Paths,
      cleanupExpiredMatches,
    });

    const result = await runTelemetryStorageCleanup({
      cutoff,
      targetVersion: 59,
      r2ScanLimit: 1_000,
    }, dependencies);

    expect(cleanupExpiredMatches).toHaveBeenCalledWith(["m1"], cutoff, 59);
    expect(deleteR2Paths).not.toHaveBeenCalled();
    expect(result.deletedMatchCount).toBe(1);
    expect(result.deletedR2PathCount).toBe(0);
  });

  it("만료 cleanup RPC가 실패하면 orphan R2 삭제도 시작하지 않는다", async () => {
    const deleteR2Paths = vi.fn().mockResolvedValue(undefined);
    const dependencies = createDependencies({
      listMasterRows: vi.fn().mockResolvedValue([{
        match_id: "m1",
        storage_path: "master/m1.json",
        telemetry_version: 58,
        created_at: "2026-07-01T00:00:00.000Z",
      }]),
      listCacheRows: vi.fn().mockResolvedValue([
        { match_id: "m1", storage_path: "map/m1/player-a/lite.json" },
      ]),
      listR2Files: vi.fn().mockResolvedValue([{
        key: "old-orphan.json",
        size: 10,
        lastModified: new Date("2026-07-01T00:00:00.000Z"),
      }]),
      deleteR2Paths,
      cleanupExpiredMatches: vi.fn().mockRejectedValue(new Error("cleanup-rpc-failure")),
    });

    await expect(runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
      r2ScanLimit: 1_000,
    }, dependencies)).rejects.toThrow("cleanup-rpc-failure");

    expect(deleteR2Paths).not.toHaveBeenCalled();
  });

  it("RPC가 최근 registry writer를 확인해 제외한 match는 삭제 카운트에 포함하지 않는다", async () => {
    const cleanupExpiredMatches = vi.fn().mockResolvedValue([]);
    const dependencies = createDependencies({
      listMasterRows: vi.fn().mockResolvedValue([{
        match_id: "m1",
        storage_path: "master/m1.json",
        telemetry_version: 58,
        created_at: "2026-07-01T00:00:00.000Z",
      }]),
      listCacheRows: vi.fn().mockResolvedValue([]),
      cleanupExpiredMatches,
    });

    const result = await runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
      r2ScanLimit: 1_000,
    }, dependencies);

    expect(cleanupExpiredMatches).toHaveBeenCalledTimes(1);
    expect(result.deletedMatchCount).toBe(0);
  });

  it("orphan 스캔은 master와 registry 활성 경로를 모두 보존하고 R2를 한 번만 조회한다", async () => {
    const deleteR2Paths = vi.fn().mockResolvedValue(undefined);
    const listR2Files = vi.fn().mockResolvedValue([
      { key: "master/active.json", size: 10, lastModified: new Date("2026-07-01T00:00:00.000Z") },
      { key: "map/active.json", size: 20, lastModified: new Date("2026-07-01T00:00:00.000Z") },
      { key: "orphan.json", size: 30, lastModified: new Date("2026-07-01T00:00:00.000Z") },
      { key: "crates/permanent.png", size: 40, lastModified: new Date("2026-07-01T00:00:00.000Z") },
      { key: "weapons/permanent.png", size: 50, lastModified: new Date("2026-07-01T00:00:00.000Z") },
      { key: "attachments/permanent.png", size: 60, lastModified: new Date("2026-07-01T00:00:00.000Z") },
    ]);
    const dependencies = createDependencies({
      listMasterRows: vi.fn().mockResolvedValue([{
        match_id: "m1",
        storage_path: "master/active.json",
        telemetry_version: 60,
        created_at: "2026-07-18T00:00:00.000Z",
      }]),
      listCacheRows: vi.fn().mockResolvedValue([
        { match_id: "m1", storage_path: "map/active.json" },
      ]),
      listR2Files,
      deleteR2Paths,
    });

    await runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
      r2ScanLimit: 1_000,
    }, dependencies);

    expect(listR2Files).toHaveBeenCalledTimes(1);
    expect(deleteR2Paths).toHaveBeenCalledTimes(1);
    expect(deleteR2Paths).toHaveBeenCalledWith(["orphan.json"]);
  });

  it("스냅샷 후 생성된 최근 object와 timestamp 미확정 object는 보존한다", async () => {
    const deleteR2Paths = vi.fn().mockResolvedValue(undefined);
    const dependencies = createDependencies({
      listR2Files: vi.fn().mockResolvedValue([
        {
          key: "orphan/old.json",
          size: 10,
          lastModified: new Date("2026-07-01T00:00:00.000Z"),
        },
        {
          key: "telemetry-map/recent-upload.json",
          size: 20,
          lastModified: new Date("2026-07-18T00:00:00.000Z"),
        },
        { key: "orphan/missing-timestamp.json", size: 30 },
        {
          key: "orphan/invalid-timestamp.json",
          size: 40,
          lastModified: new Date("invalid"),
        },
      ]),
      deleteR2Paths,
    });

    await runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
      r2ScanLimit: 1_000,
    }, dependencies);

    expect(deleteR2Paths).toHaveBeenCalledTimes(1);
    expect(deleteR2Paths).toHaveBeenCalledWith(["orphan/old.json"]);
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
      r2ScanLimit: 1_000,
    }, dependencies)).rejects.toThrow("telemetry-cleanup-invalid-rpc-result");
  });

  it("마이그레이션이 writer 동시성을 잠금·cutoff 재검증과 트랜잭션 삭제로 보호한다", () => {
    const migration = fs.readFileSync(path.resolve(
      "supabase/migrations/20260718152309_telemetry_map_cache_entries.sql",
    ), "utf8");

    expect(migration).toContain("cleanup_expired_telemetry_matches");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("for update");
    expect(migration).toContain("cache.updated_at >= p_cutoff");
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
  });
});
