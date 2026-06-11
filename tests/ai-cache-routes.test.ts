import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as aiAnalyzePOST } from "../app/api/pubg/ai-analyze/route";
import { POST as aiSummaryPOST } from "../app/api/pubg/ai-summary/route";
import { POST as aiSquadPOST } from "../app/api/pubg/ai-squad/route";
import { AI_CACHE_VERSION } from "../lib/pubg-analysis/constants";
import { AI_CACHE_RETENTION_DAYS, AI_CACHE_TABLES, cleanupExpiredCache } from "../scripts/cleanup_ai_cache";

const {
  mockWithAuthGuard,
  mockTrackAiUsage,
  mockGetSquadAnalysisData,
  mockGenerateContentStream,
  mockGenerateContent,
  MockGoogleGenerativeAI,
} = vi.hoisted(() => {
  const mockWithAuthGuard = vi.fn();
  const mockTrackAiUsage = vi.fn();
  const mockGetSquadAnalysisData = vi.fn();
  const mockGenerateContentStream = vi.fn();
  const mockGenerateContent = vi.fn();
  const mockGetGenerativeModel = vi.fn(() => ({
    generateContentStream: mockGenerateContentStream,
    generateContent: mockGenerateContent,
  }));

  class MockGoogleGenerativeAI {
    apiKey: string;

    constructor(apiKey: string) {
      this.apiKey = apiKey;
    }

    getGenerativeModel = mockGetGenerativeModel;
  }

  return {
    mockWithAuthGuard,
    mockTrackAiUsage,
    mockGetSquadAnalysisData,
    mockGenerateContentStream,
    mockGenerateContent,
    MockGoogleGenerativeAI,
  };
});

vi.mock("@/utils/supabase/guard", () => ({
  withAuthGuard: mockWithAuthGuard,
}));

vi.mock("@/lib/pubg-analysis/aiUsageTracker", () => ({
  trackAiUsage: mockTrackAiUsage,
}));

vi.mock("@/lib/pubg-analysis/squadAnalysis", () => ({
  getSquadAnalysisData: mockGetSquadAnalysisData,
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: MockGoogleGenerativeAI,
  SchemaType: {
    OBJECT: "OBJECT",
    STRING: "STRING",
    ARRAY: "ARRAY",
  },
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: "HARM_CATEGORY_HARASSMENT",
    HARM_CATEGORY_HATE_SPEECH: "HARM_CATEGORY_HATE_SPEECH",
    HARM_CATEGORY_SEXUALLY_EXPLICIT: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    HARM_CATEGORY_DANGEROUS_CONTENT: "HARM_CATEGORY_DANGEROUS_CONTENT",
  },
  HarmBlockThreshold: {
    BLOCK_NONE: "BLOCK_NONE",
  },
}));

function createQueryChain(result: any = { data: null, error: null }) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.ilike = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockResolvedValue(result);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  return chain;
}

function createSupabaseMock(tables: Record<string, any>) {
  return {
    from: vi.fn((table: string) => {
      const chain = tables[table];
      if (!chain) throw new Error(`Unexpected table access: ${table}`);
      return chain;
    }),
  };
}

function createRequest(body: any) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createSummaryMatch(matchId = "match-1") {
  return {
    matchId,
    player_id: "player_a",
    platform: "kakao",
    createdAt: "2026-06-01T00:00:00.000Z",
    mapName: "Baltic_Main",
    gameMode: "squad",
    matchType: "competitive",
    totalTeams: 16,
    stats: {
      name: "Player_A",
      kills: 2,
      assists: 1,
      DBNOs: 1,
      damageDealt: 320,
      processedDamageDealt: 320,
      winPlace: 4,
      timeSurvived: 1200,
    },
    benchmark: {
      score: 77,
      breakdown: { combat: 78, tactical: 72, survival: 80 },
    },
    tradeStats: {
      teammateKnocks: 1,
      tradeKills: 1,
      suppCount: 1,
      revCount: 1,
      smokeCount: 1,
      smokeRescues: 1,
      reactionLatencyMs: 600,
      tradeLatencyMs: 9000,
    },
    combatPressure: {
      pressureIndex: 2.4,
      utilityStats: { throwCount: 1, hitCount: 1, totalDamage: 40, killCount: 0 },
    },
    teamImpact: { damageImpact: 110, killImpact: 100, teamDamageShare: 40, teamKillShare: 35 },
    duelStats: { wins: 2, losses: 1, reversals: 1, reversalAttempts: 1, duelWinRate: 67 },
    isolationData: { isolationIndex: 1.4, combatIsolation: 1.2, deathIsolation: 1.0, minDist: 12, heightDiff: 3, teammateCount: 3 },
    itemUseSummary: { smokes: 1 },
    itemUseStats: { distanceDamage: { short: 100, mid: 150, long: 70 } },
    goldenTimeDamage: { early: 100, mid1: 120, mid2: 80, late: 20 },
    killContribution: { solo: 1, cleanup: 1, assist: 0 },
  };
}

function mockSummaryGeminiResponse() {
  const json = JSON.stringify({
    signature: "테스트 전술가",
    signatureSub: "캐시 안정화 테스트 응답",
    finalVerdict: "검증용 최종 판정입니다.",
    debateIssues: [
      {
        topic: "전투력",
        question: "교전력이 충분한가?",
        spicyOpinion: "수치 확인 필요",
        kindOpinion: "개선 여지 있음",
        winner: "kind",
        reason: "검증 데이터",
        evaluation: "정상",
        userStats: [{ label: "딜량", value: "320" }],
        benchmarkStats: [{ label: "상위권", value: "300" }],
      },
    ],
    actionItems: [{ icon: "target", title: "검증", desc: "테스트 유지" }],
  });

  mockGenerateContentStream.mockResolvedValue({
    stream: (async function* () {
      yield { text: () => json };
    })(),
    response: Promise.resolve({
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
    }),
  });
}

describe("AI cache route stabilization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_GEMINI_API_KEY = "test-gemini-key";
    mockWithAuthGuard.mockResolvedValue({
      user: { id: "user-1" },
      supabaseAdmin: createSupabaseMock({}),
    });
    mockGetSquadAnalysisData.mockResolvedValue(null);
  });

  it("ai-analyze는 match_id뿐 아니라 player_id, platform, prompt_version으로 캐시를 조회한다", async () => {
    const matchCache = createQueryChain({
      data: { ai_result: { text: "cached-player-a-analysis" } },
      error: null,
    });
    const supabase = createSupabaseMock({
      match_ai_coaching_cache: matchCache,
    });
    mockWithAuthGuard.mockResolvedValue({ user: { id: "user-1" }, supabaseAdmin: supabase });

    const response = await aiAnalyzePOST(createRequest({
      nickname: "Player_A",
      platform: "kakao",
      coachingStyle: "spicy",
      matchData: {
        matchId: "match-a",
        stats: { kills: 1, assists: 0, DBNOs: 1, damageDealt: 100, winPlace: 10, timeSurvived: 600 },
      },
    }));
    const text = await response.text();

    expect(text).toContain("cached-player-a-analysis");
    expect(matchCache.eq).toHaveBeenCalledWith("match_id", "match-a");
    expect(matchCache.eq).toHaveBeenCalledWith("platform", "kakao");
    expect(matchCache.eq).toHaveBeenCalledWith("player_id", "player_a");
    expect(matchCache.eq).toHaveBeenCalledWith("coaching_style", "spicy");
    expect(matchCache.eq).toHaveBeenCalledWith("prompt_version", AI_CACHE_VERSION);
  });

  it("ai-summary는 force=true일 때 기존 AI 캐시 조회를 건너뛰고 새 결과를 upsert한다", async () => {
    mockSummaryGeminiResponse();

    const summaryCache = createQueryChain();
    const telemetry = createQueryChain({
      data: [{
        match_id: "match-1",
        data: { fullResult: createSummaryMatch("match-1") },
      }],
      error: null,
    });
    const globalBenchmarks = createQueryChain({ data: [], error: null });
    const tierBenchmarks = createQueryChain({ data: null, error: null });
    const supabase = createSupabaseMock({
      player_ai_summary_cache: summaryCache,
      processed_match_telemetry: telemetry,
      global_benchmarks: globalBenchmarks,
      benchmark_stats_by_tier: tierBenchmarks,
    });
    mockWithAuthGuard.mockResolvedValue({ user: { id: "user-1" }, supabaseAdmin: supabase });

    const response = await aiSummaryPOST(createRequest({
      matchIds: ["match-1"],
      nickname: "Player_A",
      platform: "kakao",
      force: true,
    }));
    const text = await response.text();

    expect(text).toContain("\"type\":\"done\"");
    expect(summaryCache.select).not.toHaveBeenCalled();
    expect(summaryCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        player_id: "player_a",
        platform: "kakao",
        prompt_version: AI_CACHE_VERSION,
      }),
      { onConflict: "player_id,platform,match_ids_hash,prompt_version" }
    );
  });

  it("ai-squad는 Gemini 실패 시 최초 파싱한 body로 fallback 응답을 만든다", async () => {
    mockGenerateContent.mockRejectedValue(new Error("Gemini unavailable"));

    const squadCache = createQueryChain({ data: null, error: null });
    const supabase = createSupabaseMock({
      squad_ai_coaching_cache: squadCache,
    });
    mockWithAuthGuard.mockResolvedValue({ user: { id: "user-1" }, supabaseAdmin: supabase });

    const response = await aiSquadPOST(createRequest({
      groupKey: "alpha,beta",
      nickname: "Player_A",
      platform: "steam",
      coachingStyle: "mild",
      squadGrade: "A",
      matchIds: ["match-1", "match-2"],
      stats: {
        avgIsolation: 1.5,
        avgTradeLatency: 8000,
        avgCoverRate: 0.45,
        totalSmokeRescues: 2,
        totalRevives: 3,
        totalTeamWipes: 1,
      },
      scores: {
        formation: 70,
        backupSpeed: 75,
        survivalCare: 80,
        focusFire: 76,
        teamWipe: 65,
      },
      roleProfiles: [
        { name: "Player_A", role: "Entry", roleDesc: "진입", avgDamage: 300, avgKills: 2, avgAssists: 1, avgDbnos: 1, shares: { damage: 55, kill: 50, assist: 30, dbno: 50 } },
        { name: "Beta", role: "Support", roleDesc: "지원", avgDamage: 180, avgKills: 1, avgAssists: 2, avgDbnos: 1, shares: { damage: 45, kill: 50, assist: 70, dbno: 50 } },
      ],
    }));
    const json = await response.json();

    expect(json.squadGrade).toBe("A");
    expect(json.memberFeedbacks).toHaveLength(2);
    expect(json.memberFeedbacks.map((item: any) => item.name)).toEqual(["Player_A", "Beta"]);
    expect(squadCache.eq).toHaveBeenCalledWith("player_id", "player_a");
    expect(squadCache.eq).toHaveBeenCalledWith("platform", "steam");
    expect(squadCache.eq).toHaveBeenCalledWith("prompt_version", AI_CACHE_VERSION);
  });
});

describe("AI cache cleanup", () => {
  it("새 AI 캐시 테이블 3종을 created_at 기준 30일 보존 정책으로 정리한다", async () => {
    const calls: Array<{ table: string; column: string; cutoff: string }> = [];
    const supabase = {
      from: vi.fn((table: string) => ({
        delete: vi.fn(() => ({
          lt: vi.fn(async (column: string, cutoff: string) => {
            calls.push({ table, column, cutoff });
            return { count: 1, error: null };
          }),
        })),
      })),
    };
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await cleanupExpiredCache(supabase as any, new Date("2026-06-11T00:00:00.000Z"));

    expect(AI_CACHE_RETENTION_DAYS).toBe(30);
    expect(AI_CACHE_TABLES.map((table) => table.name)).toEqual([
      "match_ai_coaching_cache",
      "player_ai_summary_cache",
      "squad_ai_coaching_cache",
    ]);
    expect(calls).toEqual(AI_CACHE_TABLES.map((table) => ({
      table: table.name,
      column: "created_at",
      cutoff: "2026-05-12T00:00:00.000Z",
    })));

    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
