import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: mocks.from,
  })),
}));

describe("PUBG API 오류 저장", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.from.mockImplementation((table: string) => {
      if (table === "pubg_api_errors") {
        return { insert: mocks.insert.mockResolvedValue({ error: null }) };
      }
      return { insert: mocks.insert.mockResolvedValue({ data: [{ alert_key: "match:500" }], error: null }) };
    });
  });

  it("구조화된 원인 컨텍스트를 기존 오류 행에 함께 저장한다", async () => {
    const { reportPubgApiError } = await import("../lib/pubg/apiHelper");

    await reportPubgApiError({
      route: "/api/pubg/match",
      status: 502,
      message: "매치 데이터를 처리할 수 없습니다.",
      detail: "PUBG API Match Load Failed: 503",
      context: {
        failureStage: "match_fetch",
        errorCode: "PUBG_MATCH_UPSTREAM_HTTP",
        upstreamStatus: 503,
        durationMs: 1200,
        platform: "steam",
        source: "user",
        clientKind: "browser",
        requestId: "icn1::request",
        matchFingerprint: "hashed-match",
        nicknameFingerprint: "hashed-nickname",
      },
    });

    expect(mocks.from).toHaveBeenCalledWith("pubg_api_errors");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      route: "/api/pubg/match",
      status: 502,
      failure_stage: "match_fetch",
      error_code: "PUBG_MATCH_UPSTREAM_HTTP",
      upstream_status: 503,
      duration_ms: 1200,
      platform: "steam",
      source: "user",
      client_kind: "browser",
      request_id: "icn1::request",
      match_fingerprint: "hashed-match",
      nickname_fingerprint: "hashed-nickname",
    }));
  });
});
