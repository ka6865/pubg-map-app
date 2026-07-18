import { parseBoardImageSrcs } from "@/lib/board/imageHtml";

export type UploadedBoardImage = {
  imageId: string;
  publicUrl: string;
};

export type UploadedBoardImageClassification =
  | {
    ok: true;
    contentImageIds: string[];
    unusedImageIds: string[];
  }
  | { ok: false };

/**
 * 업로드된 이미지가 현재 본문 또는 대표 이미지에서 사용 중인지 한 번의 HTML 파싱으로 분류합니다.
 * 파싱 실패는 빈 참조 목록과 구분해 저장 흐름을 중단할 수 있도록 전달합니다.
 */
export function classifyUploadedBoardImages(
  uploadedImages: UploadedBoardImage[],
  content: string,
  thumbnailUrl = ""
): UploadedBoardImageClassification {
  const contentImageSrcs = parseBoardImageSrcs(content);
  if (!contentImageSrcs.ok) return { ok: false };
  const contentUrls = new Set(contentImageSrcs.srcs);
  const contentImageIds = new Set<string>();
  const unusedImageIds = new Set<string>();

  for (const image of uploadedImages) {
    if (!image.imageId || !image.publicUrl) continue;
    if (contentUrls.has(image.publicUrl)) {
      contentImageIds.add(image.imageId);
    } else if (thumbnailUrl !== image.publicUrl) {
      unusedImageIds.add(image.imageId);
    }
  }

  return {
    ok: true,
    contentImageIds: [...contentImageIds],
    unusedImageIds: [...unusedImageIds],
  };
}
