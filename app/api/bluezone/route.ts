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
    const response = await fetch(data.publicUrl, {
      next: { revalidate: 3600 }
    });

    if (!response.ok) {
      throw new Error("데이터를 가져오는 중 오류가 발생했습니다.");
    }

    const jsonData = await response.json();

    return NextResponse.json(jsonData);
  } catch (error) {
    console.error("Bluezone API Error:", error);
    return NextResponse.json({ error: "Failed to load bluezone data" }, { status: 500 });
  }
}
