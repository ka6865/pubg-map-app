import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../app/api/posts/write/route.ts", import.meta.url), "utf8");
const clientSource = readFileSync(new URL("../components/board/BoardWriteClient.tsx", import.meta.url), "utf8");
const writeSource = readFileSync(new URL("../components/BoardWrite.tsx", import.meta.url), "utf8");

describe("게시글 이미지 원자 저장 경계", () => {
  it("기존 images 버킷 직접 업로드·삭제를 사용하지 않는다", () => {
    expect(writeSource).not.toMatch(/storage\.from\(["']images["']\)\.(upload|remove)/);
    expect(routeSource).not.toMatch(/storage\.from\(["']images["']\)\.remove/);
  });

  it("guest 이미지 control은 비활성화하고 업로드를 시작하지 않는다", () => {
    expect(writeSource).toContain("if (isGuest) return;");
    expect(writeSource).toContain("disabled={isGuest || isUploadingImage}");
    expect(writeSource).toContain("isGuest ? [] : [\"image\"]");
  });

  it("회원 업로드는 reserve, signed upload, complete 순서를 지키며 token을 registry에 보관하지 않는다", () => {
    const reserveAt = writeSource.indexOf("reserveBoardImage(compressedFile)");
    const uploadAt = writeSource.indexOf("uploadToSignedUrl(");
    const completeAt = writeSource.indexOf("completeBoardImage(reservation.imageId)");
    expect(reserveAt).toBeGreaterThan(-1);
    expect(uploadAt).toBeGreaterThan(reserveAt);
    expect(completeAt).toBeGreaterThan(uploadAt);
    expect(writeSource).toContain("{ imageId: completed.imageId, publicUrl: completed.publicUrl }");
    expect(writeSource).not.toContain("token: reservation.token");
  });

  it("취소와 미사용 이미지는 release API만 사용하고 언마운트 요청을 만들지 않는다", () => {
    expect(writeSource).toContain('fetch("/api/board/images/release"');
    expect(writeSource).not.toMatch(/useEffect\(\(\) => \{[\s\S]{0,400}releaseBoardImages/);
  });

  it("본문 이미지 분류 실패 시 release와 게시글 저장보다 먼저 중단한다", () => {
    const classifyAt = writeSource.indexOf("const imageClassification = classifyUploadedBoardImages(");
    const failureReturnAt = writeSource.indexOf("if (!imageClassification.ok)");
    const releaseAt = writeSource.indexOf("await releaseBoardImages(imageClassification.unusedImageIds)");
    const saveAt = writeSource.indexOf("await handleSavePost({ contentImageIds, thumbnailImageId })");

    expect(classifyAt).toBeGreaterThan(-1);
    expect(failureReturnAt).toBeGreaterThan(classifyAt);
    expect(writeSource.indexOf("toast.error(\"본문 이미지 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.\")", failureReturnAt)).toBeGreaterThan(failureReturnAt);
    expect(releaseAt).toBeGreaterThan(failureReturnAt);
    expect(saveAt).toBeGreaterThan(releaseAt);
  });

  it("클라이언트 body는 revision과 image ID 참조를 전달한다", () => {
    expect(clientSource).toContain("expectedRevision");
    expect(clientSource).toContain("contentImageIds");
    expect(clientSource).toContain("thumbnailImageId");
  });

  it("write route는 17개 인자의 단일 RPC로만 post와 ref를 저장한다", () => {
    expect(routeSource).toContain('rpc("write_board_post_with_images"');
    expect(routeSource).toContain("p_content_image_ids: input.contentImageIds");
    expect(routeSource).toContain("p_thumbnail_image_id: input.thumbnailImageId");
    expect(routeSource).not.toMatch(/\.from\(["']posts["']\)\.(insert|update)/);
    expect(routeSource).not.toContain("oldImages");
    expect(routeSource).not.toContain("deletedImages");
  });
});
