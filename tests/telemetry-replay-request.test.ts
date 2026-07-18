// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useLatestTelemetryRequest } from "../hooks/useLatestTelemetryRequest";
import type { TelemetryRequestToken } from "../hooks/useLatestTelemetryRequest";
import { resolveReplay3DRequest } from "../lib/pubg-analysis/replay3dRequest";

describe("3D latest telemetry request 경계", () => {
  it("새 요청은 이전 요청을 abort하고 이전 cleanup은 최신 요청을 취소하지 못한다", () => {
    const { result } = renderHook(() => useLatestTelemetryRequest());
    let first!: TelemetryRequestToken;
    let second!: TelemetryRequestToken;
    act(() => { first = result.current.begin(); });
    act(() => { second = result.current.begin(); });

    expect(first.controller.signal.aborted).toBe(true);
    expect(second.controller.signal.aborted).toBe(false);
    expect(result.current.isCurrent(first)).toBe(false);
    expect(result.current.isCurrent(second)).toBe(true);

    act(() => result.current.cancel(first));
    expect(second.controller.signal.aborted).toBe(false);
    act(() => result.current.cancel(second));
    expect(second.controller.signal.aborted).toBe(true);
  });

  it("unmount 시 현재 요청을 abort한다", () => {
    const { result, unmount } = renderHook(() => useLatestTelemetryRequest());
    let request!: TelemetryRequestToken;
    act(() => { request = result.current.begin(); });

    unmount();

    expect(request.controller.signal.aborted).toBe(true);
  });
});

describe("3D query 경계", () => {
  it("완전 무쿼리만 Steam 데모로 해석한다", () => {
    expect(resolveReplay3DRequest({
      matchId: null,
      nickname: null,
      platform: null,
    })).toMatchObject({ platform: "steam", isDemo: true });
  });

  it("matchId·nickname·platform이 전부 있으면 해당 identity를 유지한다", () => {
    expect(resolveReplay3DRequest({
      matchId: "match-kakao",
      nickname: "Player",
      platform: "kakao",
    })).toEqual({
      matchId: "match-kakao",
      nickname: "Player",
      platform: "kakao",
      isDemo: false,
    });
  });

  it("일부 query 누락과 미지원 platform은 fail-closed한다", () => {
    for (const query of [
      { matchId: "match-1", nickname: "Player", platform: null },
      { matchId: "match-1", nickname: null, platform: "steam" },
      { matchId: null, nickname: "Player", platform: "steam" },
      { matchId: "match-1", nickname: "Player", platform: "xbox" },
    ]) {
      expect(() => resolveReplay3DRequest(query)).toThrow(
        "3D 리플레이 query가 누락되었거나 지원되지 않습니다.",
      );
    }
  });
});
