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

  let payload: TelemetryPayload;
  try {
    payload = parseTelemetryPayload(JSON.parse(body), buildTelemetryPublicIdentity(identity));
  } catch {
    return null;
  }

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
