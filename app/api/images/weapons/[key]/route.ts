import { NextResponse } from "next/server";
import { downloadBufferFromR2 } from "@/lib/pubg-analysis/r2Service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  if (!key) {
    return new NextResponse("Key is required", { status: 400 });
  }

  const r2Key = `weapons/${key}`;

  try {
    // 1. R2 버킷에서 이미지 바이너리 획득 시도
    const buffer = await downloadBufferFromR2(r2Key);
    if (!buffer) {
      return new NextResponse("Image not found", { status: 404 });
    }

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable", // 강력한 캐싱 설정
      },
    });
  } catch (error) {
    console.error("Weapon image proxy error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
