import { NextResponse } from "next/server";
import { hasOnlyKeys, isUuid } from "@/lib/board/imageStorageContract";
import { completeBoardImageUpload, type BoardImageStorageAdmin } from "@/lib/board/imageStorage.server";
import { withAuthGuard } from "@/utils/supabase/guard";

export async function POST(request: Request) {
  const body = await parseBody(request);
  if (!body || !hasOnlyKeys(body, ["imageId"]) || !isUuid(body.imageId)) {
    return NextResponse.json({ error: "이미지 요청이 올바르지 않습니다." }, { status: 400 });
  }

  const auth = await withAuthGuard();
  if (auth.error) return auth.error;
  const result = await completeBoardImageUpload({
    supabaseAdmin: auth.supabaseAdmin as BoardImageStorageAdmin,
    ownerUserId: auth.user.id,
    imageId: body.imageId,
  });
  if (!result.ok) return NextResponse.json({ error: "이미지를 완료하지 못했습니다." }, { status: result.status });
  return NextResponse.json(result.data);
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
