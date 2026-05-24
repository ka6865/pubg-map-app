import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { uploadToR2 } from "@/lib/pubg-analysis/r2Service";

// 관리자 권한 검증 및 세션 체크
async function verifyAdmin() {
  const supabaseServer = await createClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  
  if (profile?.role === "admin") {
    return { user };
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const adminContext = await verifyAdmin();
    if (!adminContext) {
      return NextResponse.json({ error: "🔒 관리자 권한이 없습니다." }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    
    if (!file) {
      return NextResponse.json({ error: "업로드할 파일이 존재하지 않습니다." }, { status: 400 });
    }

    // 파일 데이터를 Buffer로 변환
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // 파일명 정규화 및 고유키 접미사 부여 (파일명 충돌 방지)
    const rawFilename = file.name;
    const lastDotIndex = rawFilename.lastIndexOf(".");
    const ext = lastDotIndex !== -1 ? rawFilename.substring(lastDotIndex) : ".png";
    const baseName = lastDotIndex !== -1 ? rawFilename.substring(0, lastDotIndex) : rawFilename;
    const sanitizedBase = baseName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    
    // 6자리 랜덤 난수를 추가하여 한글명 치환(예: _______.png) 시 덮어쓰기 및 경로 꼬임 원천 방지
    const uniqueId = Math.random().toString(36).substring(2, 8);
    const uniqueFilename = `${sanitizedBase}_${uniqueId}${ext}`;
    
    const r2Key = `crates/${uniqueFilename}`;

    // R2 버킷에 업로드 수행
    await uploadToR2(r2Key, buffer, file.type || "image/png");

    // 클라이언트가 Next.js 이미지 프록시를 통해 접근할 수 있는 상대 경로 반환
    const cdnUrl = `/api/images/crates/${uniqueFilename}`;

    return NextResponse.json({
      success: true,
      url: cdnUrl,
      filename: uniqueFilename
    });

  } catch (error: any) {
    console.error("Crate image upload error:", error);
    return NextResponse.json({ error: error.message || "R2 업로드 통신 실패" }, { status: 500 });
  }
}
