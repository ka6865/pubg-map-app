import { NextResponse } from "next/server";
import { BOARD_IMAGE_MAX_BATCH, hasOnlyKeys, isUuid } from "@/lib/board/imageStorageContract";
import { releaseBoardImages, type BoardImageStorageAdmin } from "@/lib/board/imageStorage.server";
import { withAuthGuard } from "@/utils/supabase/guard";

export async function POST(request: Request) {
  const body = await parseBody(request);
  if (!body || !hasOnlyKeys(body, ["imageIds"]) || !isImageIds(body.imageIds)) {
    return NextResponse.json({ error: "이미지 요청이 올바르지 않습니다." }, { status: 400 });
  }

  const auth = await withAuthGuard();
  if (auth.error) return auth.error;
  const result = await releaseBoardImages({
    supabaseAdmin: auth.supabaseAdmin as BoardImageStorageAdmin,
    ownerUserId: auth.user.id,
    imageIds: body.imageIds,
  });
  if (!result.ok) return NextResponse.json({ error: "이미지 삭제를 처리하지 못했습니다." }, { status: result.status });
  return NextResponse.json(result.data);
}

function isImageIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= BOARD_IMAGE_MAX_BATCH && value.every(isUuid);
}

async function parseBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? body as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}
