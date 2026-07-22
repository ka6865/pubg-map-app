import { describe, expect, it, vi } from "vitest";

vi.mock("node-html-parser", () => ({
  parse: vi.fn(() => {
    throw new Error("malformed HTML");
  }),
}));

import { parseBoardImageSrcs } from "../lib/board/imageHtml";
import { classifyUploadedBoardImages } from "../lib/board-image-cleanup";

describe("게시글 이미지 HTML 파싱 실패", () => {
  it("parser 예외를 fail-closed 결과로 변환한다", () => {
    const result = parseBoardImageSrcs("<img src=\"https://example.test/a.png\">");

    expect(result).toEqual({ ok: false });
  });

  it("이미지 분류도 파싱 실패를 빈 이미지 목록으로 축약하지 않는다", () => {
    expect(classifyUploadedBoardImages([
      { imageId: "11111111-1111-4111-8111-111111111111", publicUrl: "https://example.test/a.png" },
    ], "<img src=\"https://example.test/a.png\">", "")).toEqual({ ok: false });
  });
});
