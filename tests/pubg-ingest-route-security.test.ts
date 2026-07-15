import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient, mockFrom } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

import { POST } from "../app/api/pubg/ingest/route";

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
