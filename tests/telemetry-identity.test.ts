import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createTelemetryIdentity,
  parseTelemetryMode,
  parseTelemetryPlatform,
  telemetryIdentityEquals,
} from "../lib/pubg-analysis/telemetryIdentity";
import { buildTelemetryCacheKey } from "../lib/pubg-analysis/telemetryCacheKey.server";
import {
  createTelemetryPayload,
  parseTelemetryEnvelope,
  parseTelemetryPayload,
} from "../lib/pubg-analysis/telemetryPayload";

vi.mock("server-only", () => ({}));

const identity = createTelemetryIdentity({
  matchId: "match-1",
  platform: "kakao",
  playerId: "account.player-1",
  mode: "full",
  telemetryVersion: 60,
});

describe("telemetry identity", () => {
  it("지원 platform과 mode만 허용한다", () => {
    expect(parseTelemetryPlatform("steam")).toBe("steam");
    expect(parseTelemetryPlatform("kakao")).toBe("kakao");
    expect(() => parseTelemetryPlatform(undefined)).toThrow("platform");
    expect(() => parseTelemetryPlatform("xbox")).toThrow("platform");
    expect(parseTelemetryMode("lite")).toBe("lite");
    expect(parseTelemetryMode("full")).toBe("full");
    expect(() => parseTelemetryMode("raw")).toThrow("mode");
  });

  it("player 평문 없이 identity별 R2 key를 분리한다", () => {
    const first = buildTelemetryCacheKey(identity);
    const otherPlayer = buildTelemetryCacheKey({ ...identity, playerId: "account.player-2" });
    const otherPlatform = buildTelemetryCacheKey({ ...identity, platform: "steam" });
    const otherMode = buildTelemetryCacheKey({ ...identity, mode: "lite" });
    expect(first).toMatch(/^telemetry-map\/v60\/kakao\/match-1\/[a-f0-9]{32}\/full\.json$/);
    expect(first).not.toContain("account.player-1");
    expect(new Set([first, otherPlayer, otherPlatform, otherMode]).size).toBe(4);
  });

  it("payload와 envelope identity를 완전 검증한다", () => {
    const payload = createTelemetryPayload({
      identity,
      startTime: "2026-07-18T00:00:00.000Z",
      teammates: [],
      teamNames: ["Player"],
      events: [],
      zoneEvents: [],
      mapName: "Desert_Main",
    });
    expect(parseTelemetryPayload(payload, identity)).toEqual(payload);
    expect(telemetryIdentityEquals(payload.identity, identity)).toBe(true);
    expect(() => parseTelemetryPayload({ ...payload, identity: undefined }, identity)).toThrow();
    expect(() => parseTelemetryPayload(payload, { ...identity, playerId: "other" })).toThrow();
    expect(parseTelemetryEnvelope({
      downloadUrl: "https://r2.example/signed",
      identity,
    }).identity).toEqual(identity);
  });

  it("registry migration은 RLS와 service-role 전용 계약을 고정한다", () => {
    const sql = fs.readFileSync(
      path.resolve("supabase/migrations/20260718152309_telemetry_map_cache_entries.sql"),
      "utf8",
    );
    expect(sql).toContain("create table if not exists public.telemetry_map_cache_entries");
    expect(sql).toContain("unique (match_id, platform, player_id, mode, telemetry_version)");
    expect(sql).toContain("enable row level security");
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toContain("revoke all on table public.telemetry_map_cache_entries from anon, authenticated");
    expect(sql).toContain("grant select, insert, update, delete on table public.telemetry_map_cache_entries to service_role");
  });
});
