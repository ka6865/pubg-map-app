import { parseBoardImageSrcs } from "@/lib/board/imageHtml";

export type UploadedBoardImage = {
  imageId: string;
  publicUrl: string;
};

export function getUnusedUploadedBoardImageIds(
  uploadedImages: UploadedBoardImage[],
  content: string,
  thumbnailUrl = ""
): string[] {
  const contentImageSrcs = parseBoardImageSrcs(content);
  if (!contentImageSrcs.ok) return [];
  const contentUrls = new Set(contentImageSrcs.srcs);
  return uploadedImages.flatMap((image) => {
    if (!image.imageId || !image.publicUrl) return [];
    return contentUrls.has(image.publicUrl) || thumbnailUrl === image.publicUrl
      ? []
      : [image.imageId];
  });
}

export function getContentUploadedBoardImageIds(
  uploadedImages: UploadedBoardImage[],
  content: string,
): string[] {
  const contentImageSrcs = parseBoardImageSrcs(content);
  if (!contentImageSrcs.ok) return [];
  const contentUrls = new Set(contentImageSrcs.srcs);
  return [...new Set(uploadedImages.flatMap((image) => (
    image.imageId && image.publicUrl && contentUrls.has(image.publicUrl) ? [image.imageId] : []
  )))];
}
