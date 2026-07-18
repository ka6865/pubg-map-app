import { describe, expect, it, vi } from "vitest";

vi.mock("node-html-parser", () => ({
  parse: vi.fn(() => {
    throw new Error("malformed HTML");
  }),
}));

import { parseBoardImageSrcs } from "../lib/board/imageHtml";

describe("게시글 이미지 HTML 파싱 실패", () => {
  it("parser 예외를 fail-closed 결과로 변환한다", () => {
    const result = parseBoardImageSrcs("<img src=\"https://example.test/a.png\">");

    expect(result).toEqual({ ok: false });
  });
});
