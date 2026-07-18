export type UploadedBoardImage = {
  imageId: string;
  publicUrl: string;
};

export function getUnusedUploadedBoardImageIds(
  uploadedImages: UploadedBoardImage[],
  content: string,
  thumbnailUrl = ""
): string[] {
  return uploadedImages.flatMap((image) => {
    if (!image.imageId || !image.publicUrl) return [];
    return content.includes(image.publicUrl) || thumbnailUrl.includes(image.publicUrl)
      ? []
      : [image.imageId];
  });
}
