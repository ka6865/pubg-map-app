import { describe, expect, it } from "vitest";
import { getUnusedUploadedBoardImagePaths } from "../lib/board-image-cleanup";

describe("board image cleanup", () => {
  it("대표 이미지로 사용 중인 업로드 파일은 본문에 없어도 삭제 대상으로 보지 않는다", () => {
    const uploadedPaths = [
      "1783860129904_c02y6ic2luj.jpeg",
      "1783860130000_unused.png",
    ];
    const content = "<p>대표 이미지만 별도로 올린 게시글입니다.</p>";
    const thumbnailUrl =
      "https://kolwueoejdasoqyopkao.supabase.co/storage/v1/object/public/images/1783860129904_c02y6ic2luj.jpeg";

    expect(getUnusedUploadedBoardImagePaths(uploadedPaths, content, thumbnailUrl)).toEqual([
      "1783860130000_unused.png",
    ]);
  });
});
