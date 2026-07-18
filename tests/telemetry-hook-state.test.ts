// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchTelemetryPayloadMock } = vi.hoisted(() => ({
  fetchTelemetryPayloadMock: vi.fn(),
}));

vi.mock("../lib/pubg-analysis/fetchTelemetryPayload", () => ({
  fetchTelemetryPayload: fetchTelemetryPayloadMock,
}));

import { useTelemetry } from "../hooks/useTelemetry";

function telemetryPayload(matchId: string, eventName: string) {
  return {
    identity: {
      matchId,
      platform: "steam" as const,
      playerKey: "a".repeat(32),
      mode: "lite" as const,
      telemetryVersion: 60,
    },
    startTime: "2026-07-18T00:00:00.000Z",
    teammates: ["b".repeat(32)],
    teamNames: [eventName],
    events: [{
      type: "position",
      time: "2026-07-18T00:00:00.000Z",
      name: eventName,
      x: 100,
      y: 200,
      relativeTimeMs: 100,
    }],
    zoneEvents: [{ relativeTimeMs: 0 }],
    mapName: "Baltic_Main",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("useTelemetry identity 전환", () => {
  beforeEach(() => {
    fetchTelemetryPayloadMock.mockReset();
  });

  it("platform이 누락되면 이전 events·team·zone·timeline을 즉시 비운다", async () => {
    fetchTelemetryPayloadMock.mockResolvedValue(telemetryPayload("match-1", "OldPlayer"));
    const { result, rerender } = renderHook(
      ({ platform }: { platform: "steam" | null }) =>
        useTelemetry("match-1", "OldPlayer", platform, "erangel"),
      { initialProps: { platform: "steam" as "steam" | null } },
    );

    await waitFor(() => expect(result.current.events).toHaveLength(1));
    act(() => result.current.setCurrentTimeMs(500));

    rerender({ platform: null });

    expect(result.current.events).toEqual([]);
    expect(result.current.teammates).toEqual([]);
    expect(result.current.teamNames).toEqual([]);
    expect(result.current.zoneEvents).toEqual([]);
    expect(result.current.currentTimeMs).toBe(0);
    expect(result.current.maxTimeMs).toBe(0);
  });

  it("새 identity 요청이 실패해도 이전 성공 궤적을 복원하지 않는다", async () => {
    fetchTelemetryPayloadMock
      .mockResolvedValueOnce(telemetryPayload("match-1", "OldPlayer"))
      .mockRejectedValueOnce(new Error("텔레메트리 요청에 실패했습니다."));
    const { result, rerender } = renderHook(
      ({ matchId }) => useTelemetry(matchId, "Player", "steam", "erangel"),
      { initialProps: { matchId: "match-1" } },
    );

    await waitFor(() => expect(result.current.events).toHaveLength(1));
    rerender({ matchId: "match-2" });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.events).toEqual([]);
    expect(result.current.teamNames).toEqual([]);
    expect(result.current.zoneEvents).toEqual([]);
    expect(result.current.maxTimeMs).toBe(0);
  });

  it("중단된 이전 identity 응답이 새 identity 상태를 덮어쓰지 못한다", async () => {
    const oldRequest = deferred<ReturnType<typeof telemetryPayload>>();
    const newRequest = deferred<ReturnType<typeof telemetryPayload>>();
    fetchTelemetryPayloadMock
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    const { result, rerender } = renderHook(
      ({ matchId }) => useTelemetry(matchId, "Player", "steam", "erangel"),
      { initialProps: { matchId: "match-1" } },
    );

    await waitFor(() => expect(fetchTelemetryPayloadMock).toHaveBeenCalledTimes(1));
    const oldSignal = fetchTelemetryPayloadMock.mock.calls[0][1].signal as AbortSignal;
    rerender({ matchId: "match-2" });
    await waitFor(() => expect(fetchTelemetryPayloadMock).toHaveBeenCalledTimes(2));
    expect(oldSignal.aborted).toBe(true);

    await act(async () => newRequest.resolve(telemetryPayload("match-2", "NewPlayer")));
    await waitFor(() => expect(result.current.teamNames).toEqual(["NewPlayer"]));
    await act(async () => oldRequest.resolve(telemetryPayload("match-1", "OldPlayer")));

    expect(result.current.teamNames).toEqual(["NewPlayer"]);
    expect(result.current.events[0]?.name).toBe("NewPlayer");
  });
});
