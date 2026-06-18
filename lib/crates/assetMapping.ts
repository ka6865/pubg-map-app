export interface CrateAssetSource {
  name?: string | null;
  image_url?: string | null;
  asset_key?: string | null;
  normalized_name?: string | null;
  r2_key?: string | null;
}

export function normalizeCrateItemName(name: string | null | undefined) {
  return String(name || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/["'`]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

export function getCrateR2KeyFromImageUrl(imageUrl: string | null | undefined) {
  const value = String(imageUrl || "").trim();
  if (!value) return "";

  const marker = "/api/images/crates/";
  const markerIndex = value.indexOf(marker);
  if (markerIndex >= 0) {
    return `crates/${decodeURIComponent(value.slice(markerIndex + marker.length).split(/[?#]/)[0] || "")}`;
  }

  if (value.startsWith("crates/")) return value.split(/[?#]/)[0] || "";
  return "";
}

export function getCrateAssetKeyFromImageUrl(imageUrl: string | null | undefined) {
  const r2Key = getCrateR2KeyFromImageUrl(imageUrl);
  const filename = r2Key.split("/").pop() || "";
  return filename.replace(/\.[^.]+$/, "");
}

export function resolveCrateAssetFields(source: CrateAssetSource) {
  const normalizedName = source.normalized_name || normalizeCrateItemName(source.name);
  const r2Key = source.r2_key || getCrateR2KeyFromImageUrl(source.image_url);
  const assetKey = source.asset_key || getCrateAssetKeyFromImageUrl(source.image_url) || normalizedName;

  return {
    asset_key: assetKey,
    normalized_name: normalizedName,
    r2_key: r2Key,
  };
}

