import { parse } from "node-html-parser";

export type BoardImageSrcParseResult =
  | { ok: true; srcs: string[] }
  | { ok: false };

/**
 * 게시글 HTML에서 실제 img 요소의 src 속성만 수집합니다.
 * 파싱 실패는 호출자가 삭제·분리 작업을 중단할 수 있도록 명시적으로 전달합니다.
 */
export function parseBoardImageSrcs(html: string): BoardImageSrcParseResult {
  try {
    const root = parse(html);
    const srcs = root.querySelectorAll("img").flatMap((image) => {
      const src = image.getAttribute("src");
      return typeof src === "string" ? [src] : [];
    });
    return { ok: true, srcs };
  } catch {
    return { ok: false };
  }
}
