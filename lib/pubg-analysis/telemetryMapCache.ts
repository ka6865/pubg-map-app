import "server-only";
import {
  buildTelemetryCacheKey,
  buildTelemetryPublicIdentity,
} from "./telemetryCacheKey.server";
import {
  parseTelemetryPayload,
  type TelemetryPayload,
} from "./telemetryPayload";
import type { TelemetryIdentity } from "./telemetryIdentity";

export type TelemetryMapCacheDependencies = {
  isConfigured: () => boolean;
  download: (key: string) => Promise<string | null>;
  upload: (key: string, body: string, contentType: string) => Promise<void>;
  sign: (key: string, expiresInSeconds: number) => Promise<string>;
  reserve: (row: TelemetryMapCacheRegistryRow) => Promise<void>;
  finalize: (row: TelemetryMapCacheRegistryRow) => Promise<void>;
  now: () => Date;
};

export type TelemetryMapCacheRegistryRow = {
  match_id: string;
  platform: string;
  player_id: string;
  mode: string;
  telemetry_version: number;
  storage_path: string;
  status: "pending" | "ready";
  lease_expires_at: string | null;
  updated_at: string;
};

export type TelemetryCacheHit = {
  payload: TelemetryPayload;
  downloadUrl: string;
  storagePath: string;
};

const WRITE_LEASE_DURATION_MS = 15 * 60 * 1_000;

function buildRegistryRow(
  identity: TelemetryIdentity,
  storagePath: string,
  status: TelemetryMapCacheRegistryRow["status"],
  now: Date,
): TelemetryMapCacheRegistryRow {
  return {
    match_id: identity.matchId,
    platform: identity.platform,
    player_id: identity.playerId,
    mode: identity.mode,
    telemetry_version: identity.telemetryVersion,
    storage_path: storagePath,
    status,
    lease_expires_at: status === "pending"
      ? new Date(now.getTime() + WRITE_LEASE_DURATION_MS).toISOString()
      : null,
    updated_at: now.toISOString(),
  };
}

export async function reserveTelemetryMapCache(
  identity: TelemetryIdentity,
  deps: Pick<TelemetryMapCacheDependencies, "isConfigured" | "reserve" | "now">,
): Promise<string> {
  if (!deps.isConfigured()) {
    throw new Error("텔레메트리 캐시 저장소가 설정되지 않았습니다.");
  }
  const storagePath = buildTelemetryCacheKey(identity);
  await deps.reserve(buildRegistryRow(identity, storagePath, "pending", deps.now()));
  return storagePath;
}

export async function readTelemetryMapCache(
  identity: TelemetryIdentity,
  deps: TelemetryMapCacheDependencies,
): Promise<TelemetryCacheHit | null> {
  const storagePath = buildTelemetryCacheKey(identity);
  const body = await deps.download(storagePath);
  if (!body) return null;

  let payload: TelemetryPayload;
  try {
    payload = parseTelemetryPayload(JSON.parse(body), buildTelemetryPublicIdentity(identity));
  } catch {
    return null;
  }

  await deps.finalize(buildRegistryRow(identity, storagePath, "ready", deps.now()));

  return {
    payload,
    downloadUrl: await deps.sign(storagePath, 1800),
    storagePath,
  };
}

export async function writeTelemetryMapCache(
  identity: TelemetryIdentity,
  value: TelemetryPayload,
  deps: TelemetryMapCacheDependencies,
): Promise<TelemetryCacheHit> {
  if (!deps.isConfigured()) {
    throw new Error("텔레메트리 캐시 저장소가 설정되지 않았습니다.");
  }

  const payload = parseTelemetryPayload(value, buildTelemetryPublicIdentity(identity));
  const storagePath = buildTelemetryCacheKey(identity);
  const now = deps.now();
  await reserveTelemetryMapCache(identity, {
    isConfigured: deps.isConfigured,
    reserve: deps.reserve,
    now: () => now,
  });
  await deps.upload(storagePath, JSON.stringify(payload), "application/json");
  await deps.finalize(buildRegistryRow(identity, storagePath, "ready", now));

  return {
    payload,
    storagePath,
    downloadUrl: await deps.sign(storagePath, 1800),
  };
}
