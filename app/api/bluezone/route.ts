import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 3600; // 1시간 캐싱

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Storage의 public URL 생성
    const { data } = supabase.storage.from("app-data").getPublicUrl("bluezone_data.json");

    if (!data || !data.publicUrl) {
      throw new Error("Public URL을 생성할 수 없습니다.");
    }

    // public URL에서 데이터 Fetch (Next.js fetch API를 통해 캐싱 동작)
    let jsonData = { matches: [] };
    try {
      const response = await fetch(data.publicUrl, {
        next: { revalidate: 3600 }
      });

      if (response.ok) {
        jsonData = await response.json();
      } else {
        console.warn("Bluezone data file not found or inaccessible, returning empty data.");
      }
    } catch (fetchError) {
      console.warn("Failed to fetch bluezone data during build/request, returning empty data.");
    }

    return NextResponse.json(jsonData);
  } catch (error) {
    console.error("Bluezone API Critical Error:", error);
    return NextResponse.json({ matches: [] }, { status: 200 }); // 에러 발생 시에도 빈 배열 반환으로 빌드 보호
  }
}
