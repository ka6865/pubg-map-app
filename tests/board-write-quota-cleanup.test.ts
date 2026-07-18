import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const loadYaml = (createRequire(import.meta.url)("js-yaml") as {
  load(source: string): unknown;
}).load;

const migration = readFileSync(
  resolve("supabase/migrations/20260718122322_board_turnstile_write_boundary.sql"),
  "utf8",
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

describe("board write quota bounded cleanup migration", () => {
  it("window_started_at 순서 cleanup 인덱스와 실행당 상한을 고정한다", () => {
    expect(migration).toMatch(
      /CREATE INDEX IF NOT EXISTS board_write_rate_limits_cleanup_idx[\s\S]+window_started_at, scope, actor_hash/i,
    );
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.cleanup_board_write_rate_limits\([\s\S]+p_cutoff timestamptz[\s\S]+p_max_rows integer/i,
    );
    expect(migration).toMatch(/p_max_rows NOT BETWEEN 1 AND 5000/i);
    expect(migration).toMatch(
      /ORDER BY[\s\S]+window_started_at[\s\S]+LIMIT p_max_rows/i,
    );
    expect(migration).toMatch(
      /DELETE FROM public\.board_write_rate_limits[\s\S]+USING expired/i,
    );
  });

  it("동시 consume이 갱신한 active quota를 cleanup이 삭제하지 않도록 잠금과 postcondition을 고정한다", () => {
    expect(migration).toMatch(
      /WITH expired AS MATERIALIZED[\s\S]+WHERE window_started_at < p_cutoff[\s\S]+ORDER BY window_started_at, scope, actor_hash[\s\S]+LIMIT p_max_rows[\s\S]+FOR UPDATE SKIP LOCKED/i,
    );
    expect(migration).toMatch(
      /DELETE FROM public\.board_write_rate_limits AS target[\s\S]+USING expired[\s\S]+target\.scope = expired\.scope[\s\S]+target\.actor_hash = expired\.actor_hash[\s\S]+target\.window_started_at < p_cutoff/i,
    );
  });

  it("cleanup RPC는 invoker·빈 search_path·service_role 전용이다", () => {
    expect(migration).toMatch(
      /cleanup_board_write_rate_limits[\s\S]+SECURITY INVOKER[\s\S]+SET search_path = ''/i,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.cleanup_board_write_rate_limits\(timestamptz, integer\)[\s\S]+FROM PUBLIC, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.cleanup_board_write_rate_limits\(timestamptz, integer\)[\s\S]+TO service_role/i,
    );
    expect(migration).not.toContain("SECURITY DEFINER");
  });
});

describe("board write quota cleanup job", () => {
  it("24시간 cutoff와 1000행 상한으로 RPC를 한 번만 호출한다", async () => {
    const scriptPath = resolve("scripts/cleanup_board_write_rate_limits.ts");
    expect(existsSync(scriptPath)).toBe(true);
    if (!existsSync(scriptPath)) return;

    const cleanupModule = await import("../scripts/cleanup_board_write_rate_limits");
    const rpc = vi.fn().mockResolvedValue({ data: 17, error: null });

    await expect(cleanupModule.cleanupBoardWriteRateLimits(
      { rpc } as never,
      new Date("2026-07-19T12:00:00.000Z"),
    )).resolves.toEqual({
      cutoff: "2026-07-18T12:00:00.000Z",
      deletedRows: 17,
      maxRows: 1000,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("cleanup_board_write_rate_limits", {
      p_cutoff: "2026-07-18T12:00:00.000Z",
      p_max_rows: 1000,
    });
  });

  it("credential 누락은 client·RPC 생성 전에 fail-closed한다", async () => {
    const scriptPath = resolve("scripts/cleanup_board_write_rate_limits.ts");
    expect(existsSync(scriptPath)).toBe(true);
    if (!existsSync(scriptPath)) return;

    const cleanupModule = await import("../scripts/cleanup_board_write_rate_limits");
    const createServiceClient = vi.fn();

    await expect(cleanupModule.runBoardWriteQuotaCleanup({
      env: {},
      createServiceClient,
      now: () => new Date("2026-07-19T12:00:00.000Z"),
    })).rejects.toThrow("board-write-quota-cleanup-credentials-missing");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("기존 일일 GitHub Actions에서만 credential을 주입해 1회 실행한다", () => {
    const workflowSource = readFileSync(resolve(".github/workflows/daily-tasks.yml"), "utf8");
    const parsed: unknown = loadYaml(workflowSource);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed) || !isRecord(parsed.jobs)) return;
    const maintenance = parsed.jobs.maintenance;
    expect(isRecord(maintenance)).toBe(true);
    if (!isRecord(maintenance) || !Array.isArray(maintenance.steps)) return;
    const steps = maintenance.steps;
    const cleanupSteps = steps.filter((step) => (
      isRecord(step) && step.run === "npx tsx scripts/cleanup_board_write_rate_limits.ts"
    ));

    expect(cleanupSteps).toHaveLength(1);
    const cleanupStep = cleanupSteps[0];
    expect(isRecord(cleanupStep)).toBe(true);
    if (!isRecord(cleanupStep)) return;
    expect(cleanupStep["continue-on-error"] ?? false).toBe(false);
    expect(cleanupStep.env).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}",
      SUPABASE_SERVICE_ROLE_KEY: "${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}",
    });

    const installIndex = steps.findIndex((step) => (
      isRecord(step) && step.run === "npm ci"
    ));
    const cleanupIndex = steps.indexOf(cleanupStep);
    const externalMaintenanceIndexes = [
      "npx tsx scripts/monitor_storage.ts --label \"BEFORE\"",
      "npx tsx scripts/cleanup_telemetry.ts",
      "npx tsx scripts/cleanup_ai_cache.ts",
    ].map((command) => steps.findIndex((step) => (
      isRecord(step) && step.run === command
    )));

    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(cleanupIndex).toBe(installIndex + 1);
    expect(externalMaintenanceIndexes.every((index) => cleanupIndex < index)).toBe(true);
  });
});
