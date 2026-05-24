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

  const r2Key = `crates/${key}`;

  try {
    // 1. R2 버킷에서 이미지 바이너리 획득 시도
    const buffer = await downloadBufferFromR2(r2Key);
    if (!buffer) {
      // 2. R2에 아직 파일이 마이그레이션되지 않았을 경우, 로컬 public 폴더 경로로 폴백 리다이렉트
      return NextResponse.redirect(new URL(`/images/crates/${key}`, request.url));
    }

    // 파일 확장자 기반 Content-Type 매핑
    let contentType = "image/png";
    if (key.endsWith(".jpg") || key.endsWith(".jpeg")) {
      contentType = "image/jpeg";
    } else if (key.endsWith(".webp")) {
      contentType = "image/webp";
    } else if (key.endsWith(".gif")) {
      contentType = "image/gif";
    }

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable", // 강력한 캐싱 설정
      },
    });
  } catch (error) {
    console.error("Crate image proxy error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
