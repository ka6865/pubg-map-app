import { describe, expect, it } from "vitest";
import { getContentUploadedBoardImageIds, getUnusedUploadedBoardImageIds } from "../lib/board-image-cleanup";

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

  it("일반 텍스트·링크·query prefix는 본문 이미지 참조로 오인하지 않는다", () => {
    const image = { imageId: "11111111-1111-4111-8111-111111111111", publicUrl: "https://example.test/used.jpeg" };
    const content = `<p>${image.publicUrl}</p><a href="${image.publicUrl}">링크</a><img src="${image.publicUrl}?v=2">`;

    expect(getContentUploadedBoardImageIds([image], content)).toEqual([]);
    expect(getUnusedUploadedBoardImageIds([image], content, `${image.publicUrl}?thumb=2`)).toEqual([image.imageId]);
  });

  it("실제 img src의 정확 URL만 content ID로 반환하고 thumbnail과 중복해도 ID는 한 번만 반환한다", () => {
    const image = { imageId: "11111111-1111-4111-8111-111111111111", publicUrl: "https://example.test/used.jpeg" };
    const content = `<img alt="테스트" src="${image.publicUrl}"><img src="${image.publicUrl}">`;

    expect(getContentUploadedBoardImageIds([image], content)).toEqual([image.imageId]);
    expect(getUnusedUploadedBoardImageIds([image], content, image.publicUrl)).toEqual([]);
  });

  it("unquoted img src도 사용 중인 업로드 파일로 보존한다", () => {
    const image = { imageId: "11111111-1111-4111-8111-111111111111", publicUrl: "https://example.test/used.jpeg" };

    expect(getContentUploadedBoardImageIds([image], `<img src=${image.publicUrl}>`)).toEqual([image.imageId]);
  });
});
