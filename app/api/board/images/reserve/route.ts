import { NextResponse } from "next/server";
import {
  BOARD_IMAGE_MAX_BYTES,
  hasOnlyKeys,
  isBoardImageMimeType,
} from "@/lib/board/imageStorageContract";
import { reserveBoardImageUpload, type BoardImageStorageAdmin } from "@/lib/board/imageStorage.server";
import { withAuthGuard } from "@/utils/supabase/guard";

export async function POST(request: Request) {
  const body = await parseBody(request);
  if (!body || !hasOnlyKeys(body, ["mimeType", "byteSize"])
    || !isBoardImageMimeType(body.mimeType) || !isByteSize(body.byteSize)) {
    return NextResponse.json({ error: "이미지 요청이 올바르지 않습니다." }, { status: 400 });
  }

  const auth = await withAuthGuard();
  if (auth.error) return auth.error;
  const result = await reserveBoardImageUpload({
    supabaseAdmin: auth.supabaseAdmin as BoardImageStorageAdmin,
    ownerUserId: auth.user.id,
    mimeType: body.mimeType,
    byteSize: body.byteSize,
  });
  if (!result.ok) {
    const error = result.status === 429
      ? "이미지 업로드 한도를 초과했습니다."
      : "이미지 업로드를 준비하지 못했습니다.";
    return NextResponse.json({ error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}

function isByteSize(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= BOARD_IMAGE_MAX_BYTES;
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
