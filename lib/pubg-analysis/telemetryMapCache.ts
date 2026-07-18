import "server-only";
import { buildTelemetryCacheKey } from "./telemetryCacheKey.server";
import {
  parseTelemetryPayload,
  type TelemetryPayload,
} from "./telemetryPayload";
import type { TelemetryIdentity } from "./telemetryIdentity";

export type TelemetryMapCacheDependencies = {
  download: (key: string) => Promise<string | null>;
  upload: (key: string, body: string, contentType: string) => Promise<void>;
  sign: (key: string, expiresInSeconds: number) => Promise<string>;
  register: (row: {
    match_id: string;
    platform: string;
    player_id: string;
    mode: string;
    telemetry_version: number;
    storage_path: string;
    updated_at: string;
  }) => Promise<void>;
  now: () => Date;
};

export type TelemetryCacheHit = {
  payload: TelemetryPayload;
  downloadUrl: string;
  storagePath: string;
};

export async function readTelemetryMapCache(
  identity: TelemetryIdentity,
  deps: TelemetryMapCacheDependencies,
): Promise<TelemetryCacheHit | null> {
  const storagePath = buildTelemetryCacheKey(identity);
  const body = await deps.download(storagePath);
  if (!body) return null;

  try {
    const payload = parseTelemetryPayload(JSON.parse(body), identity);
    return {
      payload,
      downloadUrl: await deps.sign(storagePath, 1800),
      storagePath,
    };
  } catch {
    return null;
  }
}

export async function writeTelemetryMapCache(
  identity: TelemetryIdentity,
  value: TelemetryPayload,
  deps: TelemetryMapCacheDependencies,
): Promise<TelemetryCacheHit> {
  const payload = parseTelemetryPayload(value, identity);
  const storagePath = buildTelemetryCacheKey(identity);
  await deps.upload(storagePath, JSON.stringify(payload), "application/json");
  await deps.register({
    match_id: identity.matchId,
    platform: identity.platform,
    player_id: identity.playerId,
    mode: identity.mode,
    telemetry_version: identity.telemetryVersion,
    storage_path: storagePath,
    updated_at: deps.now().toISOString(),
  });

  return {
    payload,
    storagePath,
    downloadUrl: await deps.sign(storagePath, 1800),
  };
}
