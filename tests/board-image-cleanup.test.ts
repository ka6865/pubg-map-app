import { describe, expect, it } from "vitest";
import { classifyUploadedBoardImages } from "../lib/board-image-cleanup";

describe("board image cleanup", () => {
  it("대표 이미지로 사용 중인 업로드 파일은 본문에 없어도 삭제 대상으로 보지 않는다", () => {
    const uploadedImages = [
      { imageId: "11111111-1111-4111-8111-111111111111", publicUrl: "https://example.test/used.jpeg" },
      { imageId: "22222222-2222-4222-8222-222222222222", publicUrl: "https://example.test/unused.png" },
    ];
    const content = "<p>대표 이미지만 별도로 올린 게시글입니다.</p>";
    const thumbnailUrl =
      "https://example.test/used.jpeg";

    expect(classifyUploadedBoardImages(uploadedImages, content, thumbnailUrl)).toEqual({
      ok: true,
      contentImageIds: [],
      unusedImageIds: ["22222222-2222-4222-8222-222222222222"],
    });
  });

  it("동일 이미지를 본문과 대표 이미지가 함께 참조하면 삭제 후보에서 제외한다", () => {
    const image = { imageId: "11111111-1111-4111-8111-111111111111", publicUrl: "https://example.test/used.jpeg" };
    expect(classifyUploadedBoardImages([image], `<img src="${image.publicUrl}">`, image.publicUrl)).toEqual({
      ok: true,
      contentImageIds: [image.imageId],
      unusedImageIds: [],
    });
  });

  it("일반 텍스트·링크는 본문 이미지 참조로 오인하지 않는다", () => {
    const image = { imageId: "11111111-1111-4111-8111-111111111111", publicUrl: "https://example.test/used.jpeg" };
    const content = `<p>${image.publicUrl}</p><a href="${image.publicUrl}">링크</a>`;

    expect(classifyUploadedBoardImages([image], content)).toEqual({
      ok: true,
      contentImageIds: [],
      unusedImageIds: [image.imageId],
    });
  });

  it("관리형 Supabase URL의 query와 hash는 제거해 본문·대표 이미지 참조를 보존한다", () => {
    const previousBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const imageId = "11111111-1111-4111-8111-111111111111";
    const publicUrl = `https://example.supabase.co/storage/v1/object/public/board-images-v2/${imageId}`;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    try {
      expect(classifyUploadedBoardImages(
        [{ imageId, publicUrl }],
        `<p>${publicUrl}</p><a href="${publicUrl}">링크</a><img src="${publicUrl}?v=2#preview">`,
        `${publicUrl}?thumb=2#preview`,
      )).toEqual({ ok: true, contentImageIds: [imageId], unusedImageIds: [] });
    } finally {
      if (previousBaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previousBaseUrl;
    }
  });

  it("다른 origin·bucket·key의 query URL은 관리형 참조로 승격하지 않는다", () => {
    const previousBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const imageId = "11111111-1111-4111-8111-111111111111";
    const publicUrl = `https://example.supabase.co/storage/v1/object/public/board-images-v2/${imageId}`;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    try {
      for (const src of [
        `https://evil.example/storage/v1/object/public/board-images-v2/${imageId}?v=2`,
        `https://example.supabase.co/storage/v1/object/public/images/${imageId}?v=2`,
        "https://example.supabase.co/storage/v1/object/public/board-images-v2/not-a-uuid?v=2",
        `https://user:pass@example.supabase.co/storage/v1/object/public/board-images-v2/${imageId}?v=2`,
        `https://example.supabase.co/storage/v1/object/public/board-images-v2/%31${imageId.slice(1)}?v=2`,
      ]) expect(classifyUploadedBoardImages([{ imageId, publicUrl }], `<img src="${src}">`, src)).toEqual({
        ok: true, contentImageIds: [], unusedImageIds: [imageId],
      });
    } finally {
      if (previousBaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previousBaseUrl;
    }
  });

  it("실제 img src의 정확 URL만 content ID로 반환하고 thumbnail과 중복해도 ID는 한 번만 반환한다", () => {
    const image = { imageId: "11111111-1111-4111-8111-111111111111", publicUrl: "https://example.test/used.jpeg" };
    const content = `<img alt="테스트" src="${image.publicUrl}"><img src="${image.publicUrl}">`;

    expect(classifyUploadedBoardImages([image], content, image.publicUrl)).toEqual({
      ok: true,
      contentImageIds: [image.imageId],
      unusedImageIds: [],
    });
  });

  it("unquoted img src도 사용 중인 업로드 파일로 보존한다", () => {
    const image = { imageId: "11111111-1111-4111-8111-111111111111", publicUrl: "https://example.test/used.jpeg" };

    expect(classifyUploadedBoardImages([image], `<img src=${image.publicUrl}>`)).toEqual({
      ok: true,
      contentImageIds: [image.imageId],
      unusedImageIds: [],
    });
  });
});
