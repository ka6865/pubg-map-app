export const BOARD_IMAGE_BUCKET = "board-images-v2";
export const BOARD_IMAGE_MAX_BYTES = 1_572_864;
export const BOARD_IMAGE_MAX_BATCH = 20;

export const BOARD_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type BoardImageMimeType = (typeof BOARD_IMAGE_MIME_TYPES)[number];

export type ReserveBoardImageUploadInput = {
  mimeType: BoardImageMimeType;
  byteSize: number;
};

export type CompleteBoardImageUploadInput = {
  imageId: string;
};

export type ReleaseBoardImagesInput = {
  imageIds: string[];
};

export function isBoardImageMimeType(value: unknown): value is BoardImageMimeType {
  return typeof value === "string" && BOARD_IMAGE_MIME_TYPES.includes(value as BoardImageMimeType);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function canonicalizeManagedBoardImageUrl(value: string): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!baseUrl) return null;
  try {
    const origin = new URL(baseUrl).origin;
    const url = new URL(value);
    const pathPrefix = `/storage/v1/object/public/${BOARD_IMAGE_BUCKET}/`;
    if (url.origin !== origin || url.username || url.password || !url.pathname.startsWith(pathPrefix)) return null;
    const storageKey = url.pathname.slice(pathPrefix.length);
    if (!isUuid(storageKey) || storageKey !== storageKey.toLowerCase()) return null;
    return `${origin}${pathPrefix}${storageKey}`;
  } catch {
    return null;
  }
}
