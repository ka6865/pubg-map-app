import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createTelemetryIdentity } from "../lib/pubg-analysis/telemetryIdentity";
import {
  buildTelemetryPlayerKey,
  pseudonymizeTelemetryAccountIds,
} from "../lib/pubg-analysis/telemetryCacheKey.server";
import { createTelemetryPayload } from "../lib/pubg-analysis/telemetryPayload";
import {
  readTelemetryMapCache,
  writeTelemetryMapCache,
  type TelemetryMapCacheDependencies,
} from "../lib/pubg-analysis/telemetryMapCache";

vi.mock("server-only", () => ({}));

const identity = createTelemetryIdentity({
  matchId: "match-1",
  platform: "steam",
  playerId: "account.player-1",
  mode: "lite",
  telemetryVersion: 60,
});

const payload = createTelemetryPayload({
  identity: {
    matchId: identity.matchId,
    platform: identity.platform,
    playerKey: buildTelemetryPlayerKey(identity.playerId),
    mode: identity.mode,
    telemetryVersion: identity.telemetryVersion,
  },
  startTime: "2026-07-18T00:00:00.000Z",
  teammates: [],
  teamNames: ["Canonical Player"],
  events: [],
  zoneEvents: [],
  mapName: "Baltic_Main",
});

function createDeps(
  overrides: Partial<TelemetryMapCacheDependencies> = {},
): TelemetryMapCacheDependencies {
  return {
    isConfigured: () => true,
    download: vi.fn().mockResolvedValue(null),
    upload: vi.fn().mockResolvedValue(undefined),
    sign: vi.fn().mockResolvedValue("https://r2.example/signed"),
    register: vi.fn().mockResolvedValue(undefined),
    now: () => new Date("2026-07-18T00:00:00.000Z"),
    ...overrides,
  };
}

describe("telemetry map cache", () => {
  it("identity가 일치하는 새 key 본문만 cache hit로 반환한다", async () => {
    const deps = createDeps({ download: vi.fn().mockResolvedValue(JSON.stringify(payload)) });

    await expect(readTelemetryMapCache(identity, deps)).resolves.toMatchObject({
      payload,
      downloadUrl: "https://r2.example/signed",
    });
    expect(deps.sign).toHaveBeenCalledOnce();
  });

  it("identity가 없거나 다른 본문은 cache miss로 처리하고 sign하지 않는다", async () => {
    const bodies = [
      { ...payload, identity: undefined },
      { ...payload, identity: { ...payload.identity, playerKey: "0".repeat(32) } },
    ];
    const deps = createDeps({
      download: vi.fn().mockResolvedValueOnce(JSON.stringify(bodies[0])).mockResolvedValueOnce(JSON.stringify(bodies[1])),
    });

    await expect(readTelemetryMapCache(identity, deps)).resolves.toBeNull();
    await expect(readTelemetryMapCache(identity, deps)).resolves.toBeNull();
    expect(deps.sign).not.toHaveBeenCalled();
  });

  it("sign 실패는 cache miss로 숨기지 않고 전파한다", async () => {
    const signError = new Error("sign unavailable");
    const deps = createDeps({
      download: vi.fn().mockResolvedValue(JSON.stringify(payload)),
      sign: vi.fn().mockRejectedValue(signError),
    });

    await expect(readTelemetryMapCache(identity, deps)).rejects.toThrow(signError);
  });

  it("write는 R2 업로드 후 registry를 등록하고 등록 실패를 전파한다", async () => {
    const registerError = new Error("registry unavailable");
    const deps = createDeps({ register: vi.fn().mockRejectedValue(registerError) });

    await expect(writeTelemetryMapCache(identity, payload, deps)).rejects.toThrow(registerError);
    expect(deps.upload).toHaveBeenCalledOnce();
    expect(deps.register).toHaveBeenCalledOnce();
    expect(deps.register).toHaveBeenCalledWith(expect.objectContaining({
      match_id: identity.matchId,
      platform: identity.platform,
      player_id: identity.playerId,
      mode: identity.mode,
      telemetry_version: identity.telemetryVersion,
      updated_at: "2026-07-18T00:00:00.000Z",
    }));
    expect(deps.sign).not.toHaveBeenCalled();
    expect((deps.upload as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0])
      .toBeLessThan((deps.register as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
  });

  it("R2 필수 설정이 없으면 write를 시작하지 않는다", async () => {
    const deps = createDeps({ isConfigured: () => false });

    await expect(writeTelemetryMapCache(identity, payload, deps))
      .rejects.toThrow("텔레메트리 캐시 저장소");
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.register).not.toHaveBeenCalled();
    expect(deps.sign).not.toHaveBeenCalled();
  });

  it("서버 identity에서 파생한 공개 identity만 반환한다", async () => {
    const deps = createDeps();
    const result = await writeTelemetryMapCache(identity, payload, deps);
    const serialized = JSON.stringify({
      downloadUrl: result.downloadUrl,
      identity: result.payload.identity,
    });

    expect(result.payload.identity.playerKey).toBe(buildTelemetryPlayerKey(identity.playerId));
    expect(serialized).not.toContain(identity.playerId);
    expect(serialized).not.toContain("playerId");
  });

  it("리플레이 본문 accountId를 동일한 공개 키로 가명 처리한다", () => {
    const publicValue = pseudonymizeTelemetryAccountIds({
      accountId: identity.playerId,
      attackerAccountId: identity.playerId,
      assistantAccountIds: [identity.playerId],
      nested: [{ playerId: identity.playerId }],
      name: "Canonical Player",
    });
    const serialized = JSON.stringify(publicValue);

    expect(serialized).not.toContain(identity.playerId);
    expect(serialized.match(new RegExp(buildTelemetryPlayerKey(identity.playerId), "g")))
      .toHaveLength(4);
    expect(publicValue).toMatchObject({ name: "Canonical Player" });
  });

  it("match와 telemetry route는 legacy map key 문자열을 만들지 않는다", () => {
    const routePaths = ["app/api/pubg/telemetry/route.ts", "app/api/pubg/match/route.ts"];

    for (const routePath of routePaths) {
      const source = fs.readFileSync(path.resolve(routePath), "utf8");
      expect(source).toContain("telemetryMapCache");
      expect(source).not.toContain("_v${TELEMETRY_VERSION}_map");
      expect(source).not.toMatch(/platform\s*\|\|\s*["']steam["']/);
    }
  });

  it("telemetry route는 platform과 mode 누락·미지원 값을 400으로 거부한다", () => {
    const source = fs.readFileSync(path.resolve("app/api/pubg/telemetry/route.ts"), "utf8");

    expect(source).toContain("parseTelemetryPlatform(searchParams.get(\"platform\"))");
    expect(source).toContain("parseTelemetryMode(searchParams.get(\"mode\"))");
    expect(source).not.toMatch(/get\("platform"\)\s*\|\|/);
    expect(source).not.toMatch(/get\("mode"\)\s*\|\|/);
  });

  it("nickname은 정규화 비교하고 canonical name으로 engine을 실행한다", () => {
    const source = fs.readFileSync(path.resolve("app/api/pubg/telemetry/route.ts"), "utf8");

    expect(source).toContain("normalizeName(p.attributes.stats.name) === lowerNickname");
    expect(source).toMatch(/new AnalysisEngine\(\s*canonicalNickname,/);
  });
});
