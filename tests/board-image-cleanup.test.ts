import { describe, expect, it } from "vitest";
import { getUnusedUploadedBoardImageIds } from "../lib/board-image-cleanup";

describe("board image cleanup", () => {
  it("대표 이미지로 사용 중인 업로드 파일은 본문에 없어도 삭제 대상으로 보지 않는다", () => {
    const uploadedImages = [
      { imageId: "11111111-1111-4111-8111-111111111111", publicUrl: "https://example.test/used.jpeg" },
      { imageId: "22222222-2222-4222-8222-222222222222", publicUrl: "https://example.test/unused.png" },
    ];
    const content = "<p>대표 이미지만 별도로 올린 게시글입니다.</p>";
    const thumbnailUrl =
      "https://example.test/used.jpeg";

    expect(getUnusedUploadedBoardImageIds(uploadedImages, content, thumbnailUrl)).toEqual([
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("동일 이미지를 본문과 대표 이미지가 함께 참조하면 삭제 후보에서 제외한다", () => {
    const image = { imageId: "11111111-1111-4111-8111-111111111111", publicUrl: "https://example.test/used.jpeg" };
    expect(getUnusedUploadedBoardImageIds([image], `<img src="${image.publicUrl}">`, image.publicUrl)).toEqual([]);
  });
});
