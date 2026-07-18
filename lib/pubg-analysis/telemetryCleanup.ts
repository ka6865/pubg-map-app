type StorageRow = { storage_path: string | null };
type CacheRow = StorageRow & { match_id: string };

function isStoragePath(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

export function mergeActiveTelemetryPaths(
  masterRows: StorageRow[],
  cacheRows: StorageRow[],
): Set<string> {
  return new Set(
    [...masterRows, ...cacheRows]
      .map((row) => row.storage_path)
      .filter(isStoragePath),
  );
}

export function selectTelemetryCachePathsForMatches(
  rows: CacheRow[],
  matchIds: string[],
): string[] {
  const targets = new Set(matchIds);
  return rows
    .filter((row) => targets.has(row.match_id))
    .map((row) => row.storage_path)
    .filter(isStoragePath);
}
