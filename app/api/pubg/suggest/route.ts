import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  if (!q || q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const supabase = await createClient();

  try {
    // [V54.6] 정규화된 소문자 닉네임 기반으로 전방 일치 검색 (ILIKE 'q%')
    const { data, error } = await supabase
      .from("pubg_player_cache")
      .select("nickname, platform")
      .ilike("nickname", `${q}%`)
      .order("updated_at", { ascending: false })
      .limit(8);

    if (error) throw error;

    return NextResponse.json({ suggestions: data || [] });
  } catch (error: any) {
    console.error("[SUGGEST-API] Error:", error);
    return NextResponse.json({ suggestions: [] }, { status: 500 });
  }
}
