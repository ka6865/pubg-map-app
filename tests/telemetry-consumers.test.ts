import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string): string {
  return fs.readFileSync(path.resolve(file), "utf8");
}

describe("텔레메트리 소비자 계약", () => {
  const useTelemetrySource = source("hooks/useTelemetry.ts");
  const replay3dSource = source("app/replay/3d/page.tsx");
  const squad2dSource = source("components/stat/Squad2DMap.tsx");
  const matchCardSource = source("components/stat/MatchCard.tsx");
  const mapShellSource = source("components/map/MapShell.tsx");

  it("hook·3D·Squad 2D가 공용 fetch만 사용한다", () => {
    expect(useTelemetrySource).toContain("fetchTelemetryPayload");
    expect(replay3dSource).toContain("fetchTelemetryPayload");
    expect(squad2dSource).toContain("fetchTelemetryPayload");
    expect(useTelemetrySource).not.toContain("/api/pubg/telemetry");
    expect(replay3dSource).not.toContain("/api/pubg/telemetry");
    expect(squad2dSource).not.toContain("/api/pubg/telemetry");
    expect(useTelemetrySource).not.toContain("downloadUrl");
    expect(replay3dSource).not.toContain("downloadUrl");
    expect(squad2dSource).not.toContain("downloadUrl");
  });

  it("hook·3D·Squad 2D가 platform과 AbortSignal을 공용 fetch에 전달한다", () => {
    expect(useTelemetrySource).toContain("platform: playbackPlatform");
    expect(useTelemetrySource).toContain("signal: controller.signal");
    expect(replay3dSource).toContain("platform: targetPlatform");
    expect(replay3dSource).toContain("signal: controller.signal");
    expect(squad2dSource).toContain("platform: telemetryPlatform");
    expect(squad2dSource).toContain("signal: controller.signal");
    expect(replay3dSource).not.toMatch(/platform\s*\|\|\s*["']steam["']/);
  });

  it("MatchCard의 두 2D URL이 platform을 인코딩해 전달한다", () => {
    expect(matchCardSource.match(/platform=\$\{encodeURIComponent\(platform\)\}/g)).toHaveLength(2);
  });

  it("MapShell이 platform을 fail-closed 검증하고 hook에 4개 인자를 전달한다", () => {
    expect(mapShellSource).toContain("playbackPlatform");
    expect(mapShellSource).toContain("playbackPlatformError");
    expect(mapShellSource).toMatch(
      /useTelemetry\(playbackId, playbackNickname, playbackPlatform, activeMapId\)/,
    );
    expect(mapShellSource).not.toMatch(/searchParams\?\.get\(["']platform["']\)\s*\|\|\s*["']steam["']/);
    expect(mapShellSource).toContain("error={playbackPlatformError || telemetryError}");
  });

  it("닫기 동작이 replay query 네 개를 모두 제거한다", () => {
    for (const query of ["playback", "nickname", "platform", "mode"]) {
      expect(mapShellSource).toContain(`p.delete("${query}")`);
    }
  });
});
