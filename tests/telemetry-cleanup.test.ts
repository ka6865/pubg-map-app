import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
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
    cleanupExpiredMatches: vi.fn(async (matchIds: string[]) => matchIds),
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
      r2DeletionDeferred: true,
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
