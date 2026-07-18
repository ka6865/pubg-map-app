import {
  createTelemetryIdentity,
  telemetryIdentityEquals,
  type TelemetryIdentity,
} from "./telemetryIdentity";

export type TelemetryPayload = {
  identity: TelemetryIdentity;
  startTime: string;
  teammates: unknown[];
  teamNames: unknown[];
  events: unknown[];
  zoneEvents: unknown[];
  mapName: string;
};

export type TelemetryEnvelope = {
  downloadUrl: string;
  identity: TelemetryIdentity;
};

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`유효하지 않은 telemetry ${label}입니다.`);
  }
  return value as Record<string, unknown>;
}

function parsePayloadIdentity(value: unknown): TelemetryIdentity {
  const identity = requireRecord(value, "identity");
  return createTelemetryIdentity({
    matchId: identity.matchId as string,
    platform: identity.platform as TelemetryIdentity["platform"],
    playerId: identity.playerId as string,
    mode: identity.mode as TelemetryIdentity["mode"],
    telemetryVersion: identity.telemetryVersion as number,
  });
}

function parseDateTime(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("유효하지 않은 telemetry startTime입니다.");
  }
  return value;
}

function parseMapName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("유효하지 않은 telemetry mapName입니다.");
  }
  return value;
}

function parseArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`유효하지 않은 telemetry ${label}입니다.`);
  return value;
}

export function createTelemetryPayload(input: TelemetryPayload): TelemetryPayload {
  return parseTelemetryPayload(input);
}

export function parseTelemetryPayload(
  value: unknown,
  expectedIdentity?: TelemetryIdentity,
): TelemetryPayload {
  const payload = requireRecord(value, "payload");
  const identity = parsePayloadIdentity(payload.identity);
  if (expectedIdentity && !telemetryIdentityEquals(identity, createTelemetryIdentity(expectedIdentity))) {
    throw new Error("telemetry identity가 요청과 일치하지 않습니다.");
  }

  return {
    identity,
    startTime: parseDateTime(payload.startTime),
    teammates: parseArray(payload.teammates, "teammates"),
    teamNames: parseArray(payload.teamNames, "teamNames"),
    events: parseArray(payload.events, "events"),
    zoneEvents: parseArray(payload.zoneEvents, "zoneEvents"),
    mapName: parseMapName(payload.mapName),
  };
}

export function parseTelemetryEnvelope(value: unknown): TelemetryEnvelope {
  const envelope = requireRecord(value, "envelope");
  if (typeof envelope.downloadUrl !== "string" || envelope.downloadUrl.length === 0) {
    throw new Error("유효하지 않은 telemetry downloadUrl입니다.");
  }

  return {
    downloadUrl: envelope.downloadUrl,
    identity: parsePayloadIdentity(envelope.identity),
  };
}
