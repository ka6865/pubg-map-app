import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient, mockFrom, mockReportPubgApiError } = vi.hoisted(() => {
  const mockFrom = vi.fn();
  return {
    mockCreateClient: vi.fn(() => ({ from: mockFrom })),
    mockFrom,
    mockReportPubgApiError: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/pubg/apiHelper", () => ({
  reportPubgApiError: mockReportPubgApiError,
}));

import { GET } from "../app/api/pubg/match/route";

const MATCH_ROUTE_PATH = resolve("app/api/pubg/match/route.ts");
const PERSIST_MODULE_PATH = resolve("lib/pubg-analysis/persistMatchAnalysis.ts");
const SOURCE_ROOTS = ["actions", "app", "components", "hooks", "lib"];

function collectTypeScriptFiles(path: string): string[] {
  if (!existsSync(path)) return [];

  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(path, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(entryPath);
    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

describe("PUBG ingest architecture boundary", () => {
  const matchRouteSource = readFileSync(MATCH_ROUTE_PATH, "utf8");

  it("공개 ingest route를 제공하지 않는다", () => {
    expect(existsSync(resolve("app/api/pubg/ingest/route.ts"))).toBe(false);
  });

  it("제품 코드가 임시 HTTP ingest 경계와 secret/origin 설정을 참조하지 않는다", () => {
    const productFiles = SOURCE_ROOTS
      .flatMap((root) => collectTypeScriptFiles(resolve(root)))
      .map((file) => ({ file, source: readFileSync(file, "utf8") }));

    for (const forbiddenReference of [
      "/api/pubg/ingest",
      "PUBG_INGEST_INTERNAL_SECRET",
      "PUBG_INGEST_INTERNAL_ORIGIN",
    ]) {
      const offenders = productFiles
        .filter(({ source }) => source.includes(forbiddenReference))
        .map(({ file }) => file);
      expect(offenders, forbiddenReference).toEqual([]);
    }
  });

  it("persist 모듈은 match API route 외의 제품 코드에서 사용되지 않는다", () => {
    const consumers = SOURCE_ROOTS
      .flatMap((root) => collectTypeScriptFiles(resolve(root)))
      .filter((file) => file !== PERSIST_MODULE_PATH)
      .filter((file) => readFileSync(file, "utf8").includes("persistMatchAnalysis"));

    expect(consumers).toEqual([MATCH_ROUTE_PATH]);
    expect(readFileSync(MATCH_ROUTE_PATH, "utf8")).not.toMatch(/^\s*["']use client["'];?/m);
  });

  it("match route가 검증된 platform/source와 고정 forceBenchmark로 직접 저장한다", () => {
    const directCall = matchRouteSource.match(
      /await persistMatchAnalysis\(supabase,\s*\{([\s\S]*?)\n\s*\}\);/,
    );

    expect(matchRouteSource).toMatch(
      /import\s*\{[\s\S]*?\bpersistMatchAnalysis\b[\s\S]*?\}\s*from "@\/lib\/pubg-analysis\/persistMatchAnalysis";/,
    );
    expect(directCall).not.toBeNull();
    expect(directCall?.[1]).toMatch(/platform:\s*platform === "kakao" \? "kakao" : "steam",/);
    expect(directCall?.[1]).toMatch(/source:\s*source === "scraper" \? "scraper" : "user",/);
    expect(directCall?.[1].trimEnd()).toMatch(/forceBenchmark:\s*false,\s*$/);
  });

  it("파생 저장 실패는 match 결과를 실패시키지 않고 민감 세부 내용을 기록하지 않는다", () => {
    const isolatesPersistenceFailure = /try\s*\{\s*const persistenceResult = await persistMatchAnalysis[\s\S]*?\}\s*catch\s*\{\s*console\.error\("\[MATCH\] 파생 통계 저장 중 예외 발생"\);\s*\}/
      .test(matchRouteSource);

    expect(isolatesPersistenceFailure).toBe(true);
    expect(matchRouteSource).not.toContain("persistenceResult.succeeded");
    expect(matchRouteSource).not.toMatch(/persistenceResult\.failures[\s\S]*?\.message/);
    expect(matchRouteSource).not.toContain("console.log(");
  });

  it("processed telemetry를 match route에서 한 번만 identity conflict로 저장한다", () => {
    expect(matchRouteSource.match(/buildProcessedTelemetryUpsert\(/g)).toHaveLength(1);
    expect(matchRouteSource.match(/from\("processed_match_telemetry"\)\.upsert\(/g)).toHaveLength(1);
    expect(matchRouteSource).toContain('{ onConflict: "match_id,platform,player_id" }');
  });
});

describe("PUBG match query boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["platform", "xbox"],
    ["source", "external"],
  ])("허용되지 않은 %s를 저장 처리 전 400으로 거부한다", async (key, value) => {
    const response = await GET(new NextRequest(
      `http://localhost/api/pubg/match?matchId=match-1&nickname=PlayerOne&${key}=${value}`,
    ));

    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockReportPubgApiError).not.toHaveBeenCalled();
  });
});
