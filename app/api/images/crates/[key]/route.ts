import { NextResponse } from "next/server";
import { getPresignedUrlFromR2, checkObjectExists } from "@/lib/pubg-analysis/r2Service";

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
    // 1. R2 버킷에 이미지 파일이 존재하는지 가볍게 검증 (메모리 다운로드 방지)
    const exists = await checkObjectExists(r2Key);
    if (!exists) {
      // 2. R2에 아직 파일이 마이그레이션되지 않았을 경우, 로컬 public 폴더 경로로 폴백 리다이렉트
      return NextResponse.redirect(new URL(`/images/crates/${key}`, request.url));
    }

    // 3. R2 Presigned URL을 발행하여 브라우저를 302 리다이렉트 처리 (Vercel 부하 0 수렴)
    const presignedUrl = await getPresignedUrlFromR2(r2Key, 3600);
    return NextResponse.redirect(presignedUrl);
  } catch (error) {
    console.error("Crate image proxy error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

