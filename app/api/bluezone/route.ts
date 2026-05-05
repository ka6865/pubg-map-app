import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic"; // 절대 캐싱 방지

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ✅ Storage에서 직접 다운로드하여 CDN 캐시 우회
    let jsonData: any[] = [];
    try {
      const { data, error } = await supabase.storage
        .from("app-data")
        .download("bluezone_data_v2.json");

      if (data) {
        const text = await data.text();
        const parsed = JSON.parse(text);
        jsonData = Array.isArray(parsed) ? parsed : (parsed.matches ?? []);
      }
    } catch (storageError) {
      console.warn("Storage download failed, falling back to local file.");
    }

    // ✅ Storage 실패 시 로컬 파일(v2)로 폴백
    if (!Array.isArray(jsonData) || jsonData.length === 0) {
      try {
        const localPath = path.join(process.cwd(), "public", "bluezone_data_v2.json");
        const localRaw = await readFile(localPath, "utf-8");
        const localParsed = JSON.parse(localRaw);
        jsonData = Array.isArray(localParsed) ? localParsed : (localParsed.matches ?? []);
      } catch (localError) {
        console.warn("Local bluezone fallback load failed.");
      }
    }

    return NextResponse.json(jsonData);
  } catch (error) {
    console.error("Bluezone API Critical Error:", error);
    return NextResponse.json([], { status: 200 });
  }
}
