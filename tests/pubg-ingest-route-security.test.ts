import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient, mockFrom } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

import { POST, validateIngestRequest } from "../app/api/pubg/ingest/route";
import { dispatchIngestRequest } from "../app/api/pubg/match/route";

type IngestDispatchPayload = Parameters<typeof dispatchIngestRequest>[0];

const validBody = {
  matchId: "match-1",
  playerNickname: "PlayerOne",
  platform: "steam",
  finalResult: {
    matchType: "official",
    gameMode: "squad-fpp",
    isValidBenchmark: false,
    stats: { name: "PlayerOne", damageDealt: 100, kills: 1, winPlace: 10 },
  },
  source: "user",
  rawParticipants: [],
};

function buildRequest(body: unknown = validBody, authorization?: string) {
  return new Request("http://localhost/api/pubg/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

function buildRawRequest(body: string, authorization?: string) {
  return new Request("http://localhost/api/pubg/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body,
  });
}

describe("PUBG ingest route security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PUBG_INGEST_INTERNAL_SECRET;
    mockCreateClient.mockReturnValue({ from: mockFrom });
  });

  afterEach(() => {
    delete process.env.PUBG_INGEST_INTERNAL_SECRET;
  });

  it("비밀키가 없으면 DB client 생성 전 503을 반환한다", async () => {
    const response = await POST(buildRequest());

    expect(response.status).toBe(503);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it.each([undefined, "Bearer wrong"])(
    "Authorization이 없거나 다르면 401을 반환한다: %s",
    async (authorization) => {
      process.env.PUBG_INGEST_INTERNAL_SECRET = "internal-secret";
      const response = await POST(buildRequest(validBody, authorization));

      expect(response.status).toBe(401);
      expect(mockCreateClient).not.toHaveBeenCalled();
    },
  );

  it.each(["xbox", "", "steam, kakao"])("허용되지 않은 platform %s을 거부한다", async (platform) => {
    process.env.PUBG_INGEST_INTERNAL_SECRET = "internal-secret";
    const response = await POST(buildRequest(
      { ...validBody, platform },
      "Bearer internal-secret",
    ));

    expect(response.status).toBe(400);
  });

  it("외부 route의 forceBenchmark를 거부한다", async () => {
    process.env.PUBG_INGEST_INTERNAL_SECRET = "internal-secret";
    const response = await POST(buildRequest(
      { ...validBody, forceBenchmark: true },
      "Bearer internal-secret",
    ));

    expect(response.status).toBe(400);
  });

  it("허용되지 않은 source를 거부한다", async () => {
    process.env.PUBG_INGEST_INTERNAL_SECRET = "internal-secret";
    const response = await POST(buildRequest(
      { ...validBody, source: "external" },
      "Bearer internal-secret",
    ));

    expect(response.status).toBe(400);
  });

  it("128명을 초과한 participant 배열을 거부한다", async () => {
    process.env.PUBG_INGEST_INTERNAL_SECRET = "internal-secret";
    const response = await POST(buildRequest(
      { ...validBody, rawParticipants: Array.from({ length: 129 }, () => ({})) },
      "Bearer internal-secret",
    ));

    expect(response.status).toBe(413);
  });

  it("잘못된 JSON을 DB client 생성 전 400으로 거부한다", async () => {
    process.env.PUBG_INGEST_INTERNAL_SECRET = "internal-secret";
    const response = await POST(buildRawRequest("{", "Bearer internal-secret"));

    expect(response.status).toBe(400);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("512KB를 초과한 body를 DB client 생성 전 413으로 거부한다", async () => {
    process.env.PUBG_INGEST_INTERNAL_SECRET = "internal-secret";
    const response = await POST(buildRequest(
      { ...validBody, padding: "x".repeat(512 * 1024) },
      "Bearer internal-secret",
    ));

    expect(response.status).toBe(413);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});

describe("PUBG match route ingest origin security", () => {
  const payload: IngestDispatchPayload = {
    matchId: "match-1",
    playerNickname: "PlayerOne",
    finalResult: {},
    platform: "steam",
    source: "user",
  };

  beforeEach(() => {
    process.env.PUBG_INGEST_INTERNAL_SECRET = "internal-secret";
    delete process.env.PUBG_INGEST_INTERNAL_ORIGIN;
  });

  afterEach(() => {
    delete process.env.PUBG_INGEST_INTERNAL_SECRET;
    delete process.env.PUBG_INGEST_INTERNAL_ORIGIN;
  });

  it("고정 ingest origin의 origin 성분에만 secret을 전송한다", () => {
    process.env.PUBG_INGEST_INTERNAL_ORIGIN =
      "https://user:password@ingest.internal:8443/path?token=unsafe#fragment";
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

    expect(dispatchIngestRequest(payload, mockFetch)).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://ingest.internal:8443/api/pubg/ingest",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer internal-secret",
        }),
      }),
    );
  });

  it.each([undefined, "not-a-url", "ftp://ingest.internal"])(
    "고정 ingest origin이 없거나 잘못되면 요청을 건너뛴다: %s",
    (origin) => {
      if (origin) process.env.PUBG_INGEST_INTERNAL_ORIGIN = origin;
      const mockFetch = vi.fn<typeof fetch>();

      expect(dispatchIngestRequest(payload, mockFetch)).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  it("내부 secret이 없으면 match 결과를 throw하지 않고 ingest만 건너뛴다", () => {
    delete process.env.PUBG_INGEST_INTERNAL_SECRET;
    process.env.PUBG_INGEST_INTERNAL_ORIGIN = "https://ingest.internal";
    const mockFetch = vi.fn<typeof fetch>();

    expect(dispatchIngestRequest(payload, mockFetch)).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("PUBG ingest route streaming body limit", () => {
  beforeEach(() => {
    process.env.PUBG_INGEST_INTERNAL_SECRET = "internal-secret";
  });

  afterEach(() => {
    delete process.env.PUBG_INGEST_INTERNAL_SECRET;
  });

  it("Content-Length가 512KB를 초과하면 body를 읽기 전에 413을 반환한다", async () => {
    const getReader = vi.fn();
    const text = vi.fn().mockResolvedValue(JSON.stringify(validBody));
    const request = {
      headers: new Headers({
        Authorization: "Bearer internal-secret",
        "Content-Length": String((512 * 1024) + 1),
      }),
      body: { getReader },
      text,
    } as unknown as Request;

    const result = await validateIngestRequest(request);

    expect("response" in result && result.response.status).toBe(413);
    expect(getReader).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
  });

  it.each([undefined, "1"])(
    "Content-Length가 없거나 거짓이어도 stream 누적 상한 초과 즉시 reader를 취소한다: %s",
    async (contentLength) => {
      const cancel = vi.fn().mockResolvedValue(undefined);
      const read = vi.fn()
        .mockResolvedValueOnce({ done: false, value: new Uint8Array(300 * 1024) })
        .mockResolvedValueOnce({ done: false, value: new Uint8Array(300 * 1024) })
        .mockResolvedValue({ done: true, value: undefined });
      const getReader = vi.fn(() => ({ read, cancel }));
      const headers = new Headers({ Authorization: "Bearer internal-secret" });
      if (contentLength) headers.set("Content-Length", contentLength);
      const request = {
        headers,
        body: { getReader },
        text: vi.fn().mockResolvedValue("x".repeat((512 * 1024) + 1)),
      } as unknown as Request;

      const result = await validateIngestRequest(request);

      expect("response" in result && result.response.status).toBe(413);
      expect(read).toHaveBeenCalledTimes(2);
      expect(cancel).toHaveBeenCalledTimes(1);
    },
  );
});

describe("PUBG ingest route runtime structure validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PUBG_INGEST_INTERNAL_SECRET = "internal-secret";
    mockCreateClient.mockReturnValue({ from: mockFrom });
  });

  afterEach(() => {
    delete process.env.PUBG_INGEST_INTERNAL_SECRET;
  });

  it.each([
    ["null root", null],
    ["array root", []],
    ["numeric matchId", { ...validBody, matchId: 1 }],
    ["blank matchId", { ...validBody, matchId: "   " }],
    ["oversized matchId", { ...validBody, matchId: "m".repeat(129) }],
    ["numeric playerNickname", { ...validBody, playerNickname: 1 }],
    ["blank playerNickname", { ...validBody, playerNickname: "   " }],
    ["oversized playerNickname", { ...validBody, playerNickname: "p".repeat(33) }],
    ["array finalResult", { ...validBody, finalResult: [] }],
    ["non-exact platform", { ...validBody, platform: "Steam" }],
    ["object rawParticipants", { ...validBody, rawParticipants: {} }],
    ["array matchAttr", { ...validBody, matchAttr: [] }],
  ])("잘못된 런타임 구조를 DB client 생성 전에 거부한다: %s", async (_label, body) => {
    const response = await POST(buildRequest(body, "Bearer internal-secret"));

    expect(response.status).toBe(400);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});

describe("PUBG match route ingest fetch result handling", () => {
  const payload: IngestDispatchPayload = {
    matchId: "match-1",
    playerNickname: "PlayerOne",
    finalResult: {},
    platform: "steam",
    source: "user",
  };

  beforeEach(() => {
    process.env.PUBG_INGEST_INTERNAL_SECRET = "internal-secret";
    process.env.PUBG_INGEST_INTERNAL_ORIGIN = "https://ingest.internal";
  });

  afterEach(() => {
    delete process.env.PUBG_INGEST_INTERNAL_SECRET;
    delete process.env.PUBG_INGEST_INTERNAL_ORIGIN;
    vi.restoreAllMocks();
  });

  it("ingest fetch 성공은 오류를 기록하지 않는다", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

    expect(dispatchIngestRequest(payload, mockFetch)).toBe(true);
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it.each([401, 413, 500])("ingest fetch HTTP %s는 상태 코드만 기록한다", async (status) => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));

    expect(dispatchIngestRequest(payload, mockFetch)).toBe(true);
    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith("[MATCH] 인증된 ingest HTTP 실패:", status);
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("internal-secret");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("PlayerOne");
  });

  it("ingest fetch 네트워크 실패는 secret과 body 없이 기록한다", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const mockFetch = vi.fn<typeof fetch>().mockRejectedValue(
      new Error("internal-secret PlayerOne"),
    );

    expect(dispatchIngestRequest(payload, mockFetch)).toBe(true);
    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith("[MATCH] 인증된 ingest 네트워크 실패");
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("internal-secret");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("PlayerOne");
  });
});
