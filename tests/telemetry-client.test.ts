import { describe, expect, it, vi } from "vitest";

import { fetchTelemetryPayload } from "../lib/pubg-analysis/fetchTelemetryPayload";

const identity = {
  matchId: "match-1",
  platform: "kakao" as const,
  playerKey: "a".repeat(32),
  mode: "full" as const,
  telemetryVersion: 60,
};

const payload = {
  identity,
  startTime: "2026-07-18T00:00:00.000Z",
  teammates: ["b".repeat(32)],
  teamNames: ["Player One"],
  events: [],
  zoneEvents: [],
  mapName: "Desert_Main",
};

describe("fetchTelemetryPayload", () => {
  it("API·R2 fetch에 같은 AbortSignal을 전달하고 공개 identity를 검증한다", async () => {
    const signal = new AbortController().signal;
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        downloadUrl: "https://r2.example/signed?secret=hidden",
        identity,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));

    await expect(fetchTelemetryPayload({
      matchId: "match-1",
      nickname: "Player One",
      platform: "kakao",
      mapName: "Desert_Main",
      mode: "full",
    }, { fetchFn, signal })).resolves.toEqual(payload);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][1]?.signal).toBe(signal);
    expect(fetchFn.mock.calls[1][1]?.signal).toBe(signal);
    const apiUrl = String(fetchFn.mock.calls[0][0]);
    expect(apiUrl).toContain("matchId=match-1");
    expect(apiUrl).toContain("nickname=Player+One");
    expect(apiUrl).toContain("platform=kakao");
    expect(apiUrl).toContain("mapName=Desert_Main");
    expect(apiUrl).toContain("mode=full");
  });

  it("envelope와 payload identity가 다르면 제한된 오류로 거부한다", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        downloadUrl: "https://r2.example/signed?secret=hidden",
        identity,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ...payload,
        identity: { ...identity, playerKey: "c".repeat(32) },
      }), { status: 200 }));

    const error = await fetchTelemetryPayload({
      matchId: "match-1",
      nickname: "Player",
      platform: "kakao",
      mode: "full",
    }, { fetchFn }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("텔레메트리 데이터 검증에 실패했습니다.");
    expect((error as Error).message).not.toContain("signed");
    expect((error as Error).message).not.toContain("secret");
    expect((error as Error).message).not.toContain("playerKey");
  });

  it("envelope identity가 요청 match·platform·mode와 다르면 R2를 fetch하지 않는다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      downloadUrl: "https://r2.example/signed?secret=hidden",
      identity: { ...identity, platform: "steam" },
    }), { status: 200 }));

    await expect(fetchTelemetryPayload({
      matchId: "match-1",
      nickname: "Player",
      platform: "kakao",
      mode: "full",
    }, { fetchFn })).rejects.toThrow("텔레메트리 데이터 검증에 실패했습니다.");

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("API status·외부 오류 원문을 사용자 오류에 노출하지 않는다", async () => {
    const apiFetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "PUBG_API_KEY=external-secret" }),
      { status: 502 },
    ));

    await expect(fetchTelemetryPayload({
      matchId: "match-1",
      nickname: "Player",
      platform: "kakao",
      mode: "full",
    }, { fetchFn: apiFetch })).rejects.toThrow("텔레메트리 요청에 실패했습니다.");

    const networkFetch = vi.fn().mockRejectedValue(new Error("signed-url-token=external-secret"));
    const error = await fetchTelemetryPayload({
      matchId: "match-1",
      nickname: "Player",
      platform: "kakao",
      mode: "full",
    }, { fetchFn: networkFetch }).catch((caught: unknown) => caught);
    expect((error as Error).message).toBe("텔레메트리 요청에 실패했습니다.");
    expect((error as Error).message).not.toContain("external-secret");
  });

  it("R2 status·payload 오류에 signed URL이나 schema 원문을 노출하지 않는다", async () => {
    const signedUrl = "https://r2.example/signed?secret=hidden";
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ downloadUrl: signedUrl, identity }), { status: 200 }))
      .mockResolvedValueOnce(new Response("access denied: secret=hidden", { status: 403 }));

    const error = await fetchTelemetryPayload({
      matchId: "match-1",
      nickname: "Player",
      platform: "kakao",
      mode: "full",
    }, { fetchFn }).catch((caught: unknown) => caught);

    expect((error as Error).message).toBe("텔레메트리 다운로드에 실패했습니다.");
    expect((error as Error).message).not.toContain(signedUrl);
    expect((error as Error).message).not.toContain("hidden");
  });

  it("platform·mode 누락·미지원과 빈 matchId·nickname을 fetch 전에 거부한다", async () => {
    const fetchFn = vi.fn();
    const valid = {
      matchId: "match-1",
      nickname: "Player",
      platform: "steam" as const,
      mode: "lite" as const,
    };

    for (const request of [
      { ...valid, platform: undefined },
      { ...valid, platform: "xbox" },
      { ...valid, mode: undefined },
      { ...valid, mode: "raw" },
      { ...valid, matchId: "" },
      { ...valid, nickname: "   " },
    ]) {
      await expect(fetchTelemetryPayload(
        request as Parameters<typeof fetchTelemetryPayload>[0],
        { fetchFn },
      )).rejects.toThrow();
    }

    expect(fetchFn).not.toHaveBeenCalled();
  });
});
