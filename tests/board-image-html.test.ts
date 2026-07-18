import { describe, expect, it } from "vitest";
import { parseBoardImageSrcs } from "../lib/board/imageHtml";

describe("게시글 이미지 HTML 파싱", () => {
  it("실제 img 요소의 quoted·unquoted src만 정확히 수집한다", () => {
    expect(parseBoardImageSrcs('<img src="https://example.test/a.png"><img data-x="1" src=https://example.test/b.webp>')).toEqual({
      ok: true,
      srcs: ["https://example.test/a.png", "https://example.test/b.webp"],
    });
  });

  it("속성 값·텍스트·링크·query suffix의 src 문자열을 이미지 참조로 오인하지 않는다", () => {
    const imageUrl = "https://example.test/used.jpeg";
    const content = `<p>src=${imageUrl}</p><img alt="src=${imageUrl}" data-origin="${imageUrl}"><a href="${imageUrl}">링크</a><img src="${imageUrl}?v=2">`;

    expect(parseBoardImageSrcs(content)).toEqual({ ok: true, srcs: [`${imageUrl}?v=2`] });
  });
});
