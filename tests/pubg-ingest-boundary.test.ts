import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistMatchAnalysisResult } from "@/lib/pubg-analysis/persistMatchAnalysis";

const {
  mockCreateClient,
  mockEngineRun,
  mockFrom,
  mockPersistMatchAnalysis,
  mockProcessedTelemetryUpsert,
  mockReportPubgApiError,
  mockSupabase,
} = vi.hoisted(() => {
  const mockEngineRun = vi.fn();
  const mockProcessedTelemetryUpsert = vi.fn();
  const mockFrom = vi.fn((table: string) => {
    if (table === "processed_match_telemetry") {
      const query = {
        select: vi.fn(),
        eq: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      return { ...query, upsert: mockProcessedTelemetryUpsert };
    }

    return { upsert: vi.fn().mockResolvedValue({ error: null }) };
  });
  const mockSupabase = { from: mockFrom };

  return {
    mockCreateClient: vi.fn(() => mockSupabase),
    mockEngineRun,
    mockFrom,
    mockPersistMatchAnalysis: vi.fn<(...args: unknown[]) => Promise<PersistMatchAnalysisResult>>(),
    mockProcessedTelemetryUpsert,
    mockReportPubgApiError: vi.fn().mockResolvedValue(undefined),
    mockSupabase,
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

vi.mock("next/cache", () => ({
  unstable_cache: (callback: (...args: unknown[]) => unknown) => callback,
}));

vi.mock("@/lib/pubg-analysis/AnalysisEngine", () => ({
  AnalysisEngine: vi.fn(function MockAnalysisEngine() {
    return { run: mockEngineRun };
  }),
}));

vi.mock("@/lib/pubg-analysis/benchmarkAdapter", () => ({
  adaptBenchmark: vi.fn(() => ({})),
}));

vi.mock("@/lib/pubg-analysis/benchmarkLookup", () => ({
  fetchTierBenchmarkStats: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/pubg-analysis/r2Service", () => ({
  downloadFromR2: vi.fn().mockResolvedValue(null),
  uploadToR2: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/pubg-analysis/pubgApiTracker", () => ({
  trackPubgRateLimit: vi.fn(),
}));

vi.mock("@/lib/pubg-analysis/persistMatchAnalysis", () => ({
  persistMatchAnalysis: mockPersistMatchAnalysis,
}));

vi.mock("@/lib/pubg/apiHelper", () => ({
  reportPubgApiError: mockReportPubgApiError,
}));

import { GET } from "../app/api/pubg/match/route";

const MATCH_ROUTE_PATH = resolve("app/api/pubg/match/route.ts");
const PERSIST_MODULE_PATH = resolve("lib/pubg-analysis/persistMatchAnalysis.ts");
const SOURCE_ROOTS = ["actions", "app", "components", "hooks", "lib"];
const MATCH_ID = "match-behavior-1";
const NICKNAME = "PlayerOne";
const PLAYER_ID = "account-player-one";

const matchAttr = {
  mapId: "Baltic_Main",
  gameMode: "squad-fpp",
  matchType: "official",
  createdAt: "2026-07-15T00:00:00Z",
  duration: 1200,
};

const participant = {
  id: "participant-1",
  type: "participant",
  attributes: {
    accountId: PLAYER_ID,
    stats: {
      playerId: PLAYER_ID,
      name: NICKNAME,
      damageDealt: 321,
      kills: 3,
      winPlace: 4,
      timeSurvived: 1000,
    },
  },
};

const roster = {
  id: "roster-1",
  type: "roster",
  relationships: { participants: { data: [{ id: participant.id }] } },
};

const analysisResult = {
  matchType: "official",
  gameMode: "squad-fpp",
  isValidBenchmark: true,
  stats: { ...participant.attributes.stats },
  tradeStats: { tradeKills: 1 },
  killContribution: { solo: 2 },
  isolationData: { isolationIndex: 1 },
  combatPressure: { pressureIndex: 2, utilityStats: { throwCount: 3 } },
  itemUseSummary: { smokes: 2 },
  duelStats: { duelWinRate: 50 },
  itemUseStats: { lethalThrowCount: 1 },
  benchmark: { tier: "B", score: 50, breakdown: { combat: 20, tactical: 15, survival: 15 } },
  mapData: { events: [] },
};

function collectTypeScriptFiles(path: string): string[] {
  if (!existsSync(path)) return [];

  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(path, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(entryPath);
    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function importedNames(file: string, moduleName: string): string[] {
  const source = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== moduleName) {
      return [];
    }

    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return [];
    return bindings.elements.map((element) => element.propertyName?.text ?? element.name.text);
  });
}

function importsPersistModule(file: string): boolean {
  const source = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

  return sourceFile.statements.some((statement) => ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier)
    && /(?:^|\/)persistMatchAnalysis$/.test(statement.moduleSpecifier.text));
}

function createMatchRequest() {
  return new NextRequest(
    `http://localhost/api/pubg/match?matchId=${MATCH_ID}&nickname=${NICKNAME}&platform=steam&source=user`,
  );
}

function mockPubgMatchResponse() {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    data: { attributes: matchAttr },
    included: [participant, roster],
  }), { status: 200, headers: { "content-type": "application/json" } })));
}

describe("PUBG ingest architecture boundary", () => {
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
      "requestUrl",
      "dispatchIngestRequest",
    ]) {
      const offenders = productFiles
        .filter(({ source }) => source.includes(forbiddenReference))
        .map(({ file }) => file);
      expect(offenders, forbiddenReference).toEqual([]);
    }
  });

  it("TypeScript import 선언 기준으로 persist 모듈 consumer를 match route 하나로 제한한다", () => {
    const consumers = SOURCE_ROOTS
      .flatMap((root) => collectTypeScriptFiles(resolve(root)))
      .filter((file) => file !== PERSIST_MODULE_PATH)
      .filter(importsPersistModule);

    expect(consumers).toEqual([MATCH_ROUTE_PATH]);
    expect(importedNames(
      MATCH_ROUTE_PATH,
      "@/lib/pubg-analysis/persistMatchAnalysis",
    )).toContain("persistMatchAnalysis");
    expect(readFileSync(MATCH_ROUTE_PATH, "utf8")).not.toMatch(/^\s*["']use client["'];?/m);
  });
});

describe("PUBG match persistence behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEngineRun.mockReturnValue(analysisResult);
    mockPersistMatchAnalysis.mockResolvedValue({ succeeded: [], failures: [] });
    mockProcessedTelemetryUpsert.mockResolvedValue({ error: null });
    mockPubgMatchResponse();
  });

  it("정상 분석 결과를 canonical 전체 입력으로 한 번 직접 저장한다", async () => {
    const response = await GET(createMatchRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ matchId: MATCH_ID }));
    expect(mockPersistMatchAnalysis).toHaveBeenCalledTimes(1);
    expect(mockPersistMatchAnalysis).toHaveBeenCalledWith(
      mockSupabase,
      {
        matchId: MATCH_ID,
        playerNickname: NICKNAME.toLowerCase(),
        platform: "steam",
        finalResult: expect.objectContaining({
          matchId: MATCH_ID,
          player_id: NICKNAME.toLowerCase(),
          platform: "steam",
          stats: expect.objectContaining({ name: NICKNAME }),
        }),
        matchAttr,
        rawParticipants: [participant],
        source: "user",
        forceBenchmark: false,
      },
    );
  });

  it.each([
    ["returned failures", () => mockPersistMatchAnalysis.mockResolvedValue({
      succeeded: [],
      failures: [{ taskName: "match_stats_raw", message: "secret payload PlayerOne match-behavior-1 db-message" }],
    })],
    ["Promise reject", () => mockPersistMatchAnalysis.mockRejectedValue(
      new Error("secret payload PlayerOne match-behavior-1 rejected-message"),
    )],
  ])("persist %s에도 match 응답을 성공시키고 민감 정보를 로그에 남기지 않는다", async (_case, arrange) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    arrange();

    const response = await GET(createMatchRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ matchId: MATCH_ID }));
    expect(mockReportPubgApiError).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledTimes(1);
    const serializedLog = JSON.stringify(consoleError.mock.calls);
    for (const sensitiveValue of [
      "secret",
      "payload",
      NICKNAME,
      NICKNAME.toLowerCase(),
      PLAYER_ID,
      MATCH_ID,
      "db-message",
      "rejected-message",
    ]) {
      expect(serializedLog).not.toContain(sensitiveValue);
    }
    expect(serializedLog).toMatch(/match_stats_raw|파생 통계 저장 중 예외 발생/);
    consoleError.mockRestore();
  });

  it("processed telemetry를 정확히 한 번 canonical identity conflict로 upsert한다", async () => {
    const response = await GET(createMatchRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ matchId: MATCH_ID }));
    expect(mockProcessedTelemetryUpsert).toHaveBeenCalledTimes(1);
    expect(mockProcessedTelemetryUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        match_id: MATCH_ID,
        platform: "steam",
        player_id: NICKNAME.toLowerCase(),
        data: {
          fullResult: expect.objectContaining({
            matchId: MATCH_ID,
            platform: "steam",
            player_id: NICKNAME.toLowerCase(),
          }),
        },
      }),
      { onConflict: "match_id,platform,player_id" },
    );
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
