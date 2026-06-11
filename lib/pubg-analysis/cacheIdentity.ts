import { normalizeName } from "./utils";

export function normalizePlatform(platform?: string | null): string {
  return String(platform || "steam").trim().toLowerCase() || "steam";
}

export function isFullResultForPlayerPlatform(
  fullResult: any,
  expectedPlayerId: string,
  expectedPlatform: string = "steam"
): boolean {
  if (!fullResult) return false;

  const playerId = normalizeName(expectedPlayerId);
  const statsName = normalizeName(fullResult.stats?.name || "");
  if (!playerId || !statsName || statsName !== playerId) return false;

  const embeddedPlayerId = normalizeName(fullResult.player_id || statsName);
  if (embeddedPlayerId && embeddedPlayerId !== playerId) return false;

  const resultPlatform = normalizePlatform(fullResult.platform);
  return resultPlatform === normalizePlatform(expectedPlatform);
}

export function getValidFullResult(
  row: any,
  expectedPlayerId: string,
  expectedPlatform: string = "steam"
): any | null {
  const fullResult = row?.data?.fullResult;
  return isFullResultForPlayerPlatform(fullResult, expectedPlayerId, expectedPlatform)
    ? fullResult
    : null;
}

export function buildProcessedTelemetryUpsert(
  matchId: string,
  playerId: string,
  platform: string,
  fullResult: any
) {
  const normalizedPlayerId = normalizeName(playerId);
  const normalizedPlatform = normalizePlatform(platform);

  return {
    match_id: matchId,
    platform: normalizedPlatform,
    player_id: normalizedPlayerId,
    data: {
      fullResult: {
        ...fullResult,
        player_id: normalizedPlayerId,
        platform: normalizedPlatform
      }
    },
    updated_at: new Date().toISOString()
  };
}
