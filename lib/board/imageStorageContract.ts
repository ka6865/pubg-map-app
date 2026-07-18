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
