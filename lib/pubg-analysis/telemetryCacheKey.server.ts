import "server-only";
import { createHash } from "node:crypto";
import { createTelemetryIdentity, type TelemetryIdentity } from "./telemetryIdentity";

export function buildTelemetryCacheKey(input: TelemetryIdentity): string {
  const identity = createTelemetryIdentity(input);
  const playerHash = createHash("sha256").update(identity.playerId).digest("hex").slice(0, 32);

  return [
    "telemetry-map",
    `v${identity.telemetryVersion}`,
    identity.platform,
    identity.matchId,
    playerHash,
    `${identity.mode}.json`,
  ].join("/");
}
