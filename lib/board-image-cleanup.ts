export type UploadedBoardImage = {
  imageId: string;
  publicUrl: string;
};

export function getUnusedUploadedBoardImageIds(
  uploadedImages: UploadedBoardImage[],
  content: string,
  thumbnailUrl = ""
): string[] {
  const contentImageIds = new Set(getContentUploadedBoardImageIds(uploadedImages, content));
  return uploadedImages.flatMap((image) => {
    if (!image.imageId || !image.publicUrl) return [];
    return contentImageIds.has(image.imageId) || thumbnailUrl === image.publicUrl
      ? []
      : [image.imageId];
  });
}

export function getContentUploadedBoardImageIds(
  uploadedImages: UploadedBoardImage[],
  content: string,
): string[] {
  const contentUrls = new Set(
    Array.from(content.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi), (match) => match[2]),
  );
  return [...new Set(uploadedImages.flatMap((image) => (
    image.imageId && image.publicUrl && contentUrls.has(image.publicUrl) ? [image.imageId] : []
  )))];
}
