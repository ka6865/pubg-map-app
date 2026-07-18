import "server-only";
import { createHash } from "node:crypto";
import {
  createTelemetryIdentity,
  createTelemetryPublicIdentity,
  type TelemetryIdentity,
  type TelemetryPublicIdentity,
} from "./telemetryIdentity";

export function buildTelemetryPlayerKey(playerId: string): string {
  return createHash("sha256").update(playerId).digest("hex").slice(0, 32);
}

const ACCOUNT_ID_FIELD = /(?:account|player)ids?$/i;

function pseudonymizeTelemetryValue(value: unknown, fieldName?: string): unknown {
  if (typeof value === "string" && fieldName && ACCOUNT_ID_FIELD.test(fieldName)) {
    return buildTelemetryPlayerKey(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => pseudonymizeTelemetryValue(item, fieldName));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, pseudonymizeTelemetryValue(item, key)]),
    );
  }
  return value;
}

export function pseudonymizeTelemetryAccountIds<T>(value: T): T {
  return pseudonymizeTelemetryValue(value) as T;
}

export function pseudonymizeTelemetryTeammates(teammates: unknown[]): string[] {
  return teammates.map((playerId) => {
    if (typeof playerId !== "string" || playerId.length === 0) {
      throw new Error("유효하지 않은 telemetry teammate accountId입니다.");
    }
    return buildTelemetryPlayerKey(playerId);
  });
}

export function buildTelemetryPublicIdentity(
  input: TelemetryIdentity,
): TelemetryPublicIdentity {
  const identity = createTelemetryIdentity(input);
  return createTelemetryPublicIdentity({
    matchId: identity.matchId,
    platform: identity.platform,
    playerKey: buildTelemetryPlayerKey(identity.playerId),
    mode: identity.mode,
    telemetryVersion: identity.telemetryVersion,
  });
}

export function buildTelemetryCacheKey(input: TelemetryIdentity): string {
  const identity = createTelemetryIdentity(input);
  const playerHash = buildTelemetryPlayerKey(identity.playerId);

  return [
    "telemetry-map",
    `v${identity.telemetryVersion}`,
    identity.platform,
    identity.matchId,
    playerHash,
    `${identity.mode}.json`,
  ].join("/");
}
