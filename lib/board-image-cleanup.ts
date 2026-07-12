export function getUnusedUploadedBoardImagePaths(
  uploadedPaths: string[],
  content: string,
  thumbnailUrl = ""
): string[] {
  return uploadedPaths.filter((path) => {
    if (!path) return false;
    return !content.includes(path) && !thumbnailUrl.includes(path);
  });
}
