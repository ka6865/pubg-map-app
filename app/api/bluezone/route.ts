import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 3600; // 1시간 캐싱

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    // ✅ SERVICE_ROLE_KEY 우선 사용 (Storage 접근 안정성)
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data } = supabase.storage.from("app-data").getPublicUrl("bluezone_data.json");

    if (!data || !data.publicUrl) {
      throw new Error("Public URL을 생성할 수 없습니다.");
    }

    // ✅ bluezone_data.json의 실제 형식은 배열([]). 실패 시 빈 배열로 반환하여 SimulatorLayer와 호환
    let jsonData: any[] = [];
    try {
      const response = await fetch(data.publicUrl, {
        next: { revalidate: 3600 }
      });

      if (response.ok) {
        const parsed = await response.json();
        // 배열 형식이면 그대로, { matches: [...] } 구조면 내부 배열 추출
        jsonData = Array.isArray(parsed) ? parsed : (parsed.matches ?? []);
      } else {
        console.warn("Bluezone data file not found or inaccessible, returning empty data.");
      }
    } catch (fetchError) {
      console.warn("Failed to fetch bluezone data during build/request, returning empty data.");
    }

    return NextResponse.json(jsonData);
  } catch (error) {
    console.error("Bluezone API Critical Error:", error);
    // ✅ 에러 발생 시에도 빈 배열 반환으로 빌드 보호 (SimulatorLayer가 배열로 처리)
    return NextResponse.json([], { status: 200 });
  }
}

