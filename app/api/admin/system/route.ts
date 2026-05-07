import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { RESULT_VERSION } from "@/lib/pubg-analysis/constants";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, nickname, matchId } = body;
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (action === "flush_old_cache") {
      // 🚀 모든 분석 완료 데이터(가공된 데이터)만 삭제
      const { count, error } = await supabaseAdmin
        .from("processed_match_telemetry")
        .delete({ count: "exact" })
        .neq("match_id", "_dummy_");

      if (error) throw error;
      return NextResponse.json({
        success: true,
        message: `모든 분석 캐시 ${count || 0}개가 삭제되었습니다.`
      });
    }

    if (action === "flush_player_cache") {
      if (!nickname) throw new Error("플레이어 닉네임이 필요합니다.");
      const lowerNickname = nickname.toLowerCase().trim();
      
      const { count, error } = await supabaseAdmin
        .from("processed_match_telemetry")
        .delete({ count: "exact" })
        .eq("player_id", lowerNickname);

      if (error) throw error;
      return NextResponse.json({ success: true, message: `${nickname}님의 분석 캐시 ${count || 0}개가 삭제되었습니다.` });
    }

    if (action === "flush_match_cache") {
      if (!matchId) throw new Error("매치 ID가 필요합니다.");
      
      let query = supabaseAdmin.from("processed_match_telemetry").delete({ count: "exact" }).eq("match_id", matchId);
      if (nickname) query = query.eq("player_id", nickname.toLowerCase().trim());
      
      const { count, error } = await query;
      if (error) throw error;
      return NextResponse.json({ success: true, message: `매치 ${matchId}의 캐시 ${count || 0}개가 삭제되었습니다.` });
    }

    if (action === "reset_benchmarks") {
      // 벤치마크 테이블 전체 삭제
      const { count, error } = await supabaseAdmin
        .from("global_benchmarks")
        .delete({ count: "exact" })
        .neq("id", -1); // 전체 삭제를 위한 트릭 (bigint 타입 호환)

      if (error) throw error;
      return NextResponse.json({ 
        success: true, 
        message: `벤치마크 데이터 ${count || 0}개가 성공적으로 초기화되었습니다.` 
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("Admin action error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
