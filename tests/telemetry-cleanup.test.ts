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
    listMasterRows: vi.fn().mockResolvedValue([]),
    listCacheRows: vi.fn().mockResolvedValue([]),
    listR2Files: vi.fn().mockResolvedValue([]),
    deleteR2Paths: vi.fn().mockResolvedValue(undefined),
    deleteMatchRows: vi.fn().mockResolvedValue(undefined),
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

  it("registry 전체 조회가 실패하면 어떤 삭제도 시작하지 않는다", async () => {
    const deleteR2Paths = vi.fn().mockResolvedValue(undefined);
    const deleteMatchRows = vi.fn().mockResolvedValue(undefined);
    const dependencies = createDependencies({
      listCacheRows: vi.fn().mockRejectedValue(new Error("registry-unavailable")),
      deleteR2Paths,
      deleteMatchRows,
    });

    await expect(runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
      r2ScanLimit: 1_000,
    }, dependencies)).rejects.toThrow("registry-unavailable");

    expect(deleteR2Paths).not.toHaveBeenCalled();
    expect(deleteMatchRows).not.toHaveBeenCalled();
  });

  it("만료 match의 master와 모든 registry R2 경로를 지운 뒤 DB source-of-truth를 지운다", async () => {
    const calls: string[] = [];
    const deleteR2Paths = vi.fn(async (storagePaths: string[]) => {
      calls.push(`r2:${storagePaths.join(",")}`);
    });
    const deleteMatchRows = vi.fn(async (table: string) => {
      calls.push(`db:${table}`);
    });
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
        { key: "master/m1.json", size: 10 },
        { key: "map/m1/player-a/lite.json", size: 10 },
        { key: "map/m1/player-b/full.json", size: 10 },
        { key: "master/m2.json", size: 10 },
        { key: "map/m2/player-c/lite.json", size: 10 },
      ]),
      deleteR2Paths,
      deleteMatchRows,
    });

    const result = await runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
      r2ScanLimit: 1_000,
    }, dependencies);

    expect(deleteR2Paths).toHaveBeenCalledWith([
      "master/m1.json",
      "map/m1/player-a/lite.json",
      "map/m1/player-b/full.json",
    ]);
    expect(deleteMatchRows).toHaveBeenNthCalledWith(1, "match_stats_raw", ["m1"]);
    expect(deleteMatchRows).toHaveBeenNthCalledWith(2, "processed_match_telemetry", ["m1"]);
    expect(deleteMatchRows).toHaveBeenNthCalledWith(3, "telemetry_map_cache_entries", ["m1"]);
    expect(deleteMatchRows).toHaveBeenNthCalledWith(4, "match_master_telemetry", ["m1"]);
    expect(calls).toEqual([
      "r2:master/m1.json,map/m1/player-a/lite.json,map/m1/player-b/full.json",
      "db:match_stats_raw",
      "db:processed_match_telemetry",
      "db:telemetry_map_cache_entries",
      "db:match_master_telemetry",
    ]);
    expect(result.deletedMatchCount).toBe(1);
    expect(result.deletedR2PathCount).toBe(3);
  });

  it("R2 삭제가 실패하면 registry와 master row를 보존한다", async () => {
    const deleteMatchRows = vi.fn().mockResolvedValue(undefined);
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
      deleteR2Paths: vi.fn().mockRejectedValue(new Error("r2-partial-failure")),
      deleteMatchRows,
    });

    await expect(runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
      r2ScanLimit: 1_000,
    }, dependencies)).rejects.toThrow("r2-partial-failure");

    expect(deleteMatchRows).not.toHaveBeenCalled();
  });

  it("registry row 삭제가 실패하면 master row를 지우지 않는다", async () => {
    const deleteMatchRows = vi.fn(async (table: string) => {
      if (table === "telemetry_map_cache_entries") {
        throw new Error("registry-delete-failure");
      }
    });
    const dependencies = createDependencies({
      listMasterRows: vi.fn().mockResolvedValue([{
        match_id: "m1",
        storage_path: "master/m1.json",
        telemetry_version: 58,
        created_at: "2026-07-01T00:00:00.000Z",
      }]),
      listCacheRows: vi.fn().mockResolvedValue([]),
      deleteMatchRows,
    });

    await expect(runTelemetryStorageCleanup({
      cutoff: new Date("2026-07-17T00:00:00.000Z"),
      targetVersion: 59,
      r2ScanLimit: 1_000,
    }, dependencies)).rejects.toThrow("registry-delete-failure");

    expect(deleteMatchRows).not.toHaveBeenCalledWith("match_master_telemetry", ["m1"]);
  });

  it("orphan 스캔은 master와 registry 활성 경로를 모두 보존하고 R2를 한 번만 조회한다", async () => {
    const deleteR2Paths = vi.fn().mockResolvedValue(undefined);
    const listR2Files = vi.fn().mockResolvedValue([
      { key: "master/active.json", size: 10 },
      { key: "map/active.json", size: 20 },
      { key: "orphan.json", size: 30 },
      { key: "crates/permanent.png", size: 40 },
      { key: "weapons/permanent.png", size: 50 },
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

  it("cleanup script는 import 시 실행하지 않고 direct-run guard만 사용한다", () => {
    const source = fs.readFileSync(path.resolve("scripts/cleanup_telemetry.ts"), "utf8");
    expect(source).toContain("pathToFileURL(resolve(process.argv[1])).href === import.meta.url");
    expect(source).toContain("if (isDirectRun)");
    expect(source).not.toMatch(/\nsmartCleanup\(\)\.catch/);
    expect(source).not.toMatch(/process\.exit\(/);
  });
});
