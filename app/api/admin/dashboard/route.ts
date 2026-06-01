import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { listR2Files } from "@/lib/pubg-analysis/r2Service";

// 관리자 권한 검증 및 Supabase Admin 클라이언트 반환
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
    const supabaseAdmin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    return { user, supabaseAdmin };
  }
  return null;
}

export async function GET(request: Request) {
  const adminContext = await verifyAdmin();
  if (!adminContext) {
    return NextResponse.json({ error: "🔒 관리자 권한이 없습니다." }, { status: 403 });
  }

  try {
    // 0. 📊 스쿼드 및 API 절약 지표 연산 (안전장치 추가)
    let totalMatches = 0;
    let squadMatches = 0;
    let estimatedSquadGroups = 0;

    try {
      const { count: totalCount, error: totalErr } = await adminContext.supabaseAdmin
        .from("processed_match_telemetry")
        .select("match_id", { count: "exact", head: true });
      if (!totalErr && totalCount !== null) {
        totalMatches = totalCount;
      }

      const { count: squadCount, error: squadErr } = await adminContext.supabaseAdmin
        .from("processed_match_telemetry")
        .select("match_id", { count: "exact", head: true })
        .filter("data->fullResult->>gameMode", "ilike", "%squad%");
      if (!squadErr && squadCount !== null) {
        squadMatches = squadCount;
      }

      const { data: recentMatches, error: recentErr } = await adminContext.supabaseAdmin
        .from("processed_match_telemetry")
        .select("data")
        .order("updated_at", { ascending: false })
        .limit(100);

      if (!recentErr && recentMatches) {
        const squadGroups = new Set<string>();
        recentMatches.forEach(m => {
          const fullResult = (m.data as any)?.fullResult;
          if (!fullResult) return;
          const mode = fullResult.gameMode || "";
          if (!mode.includes("squad")) return;

          const team = fullResult.team || [];
          const memberNames = team
            .map((t: any) => t.name)
            .filter(Boolean)
            .sort((a: string, b: string) => a.localeCompare(b));

          if (memberNames.length > 1) {
            squadGroups.add(memberNames.join(", "));
          }
        });
        estimatedSquadGroups = squadGroups.size;
      }
    } catch (squadStatsErr) {
      console.error("[Dashboard API] Squad statistics calculation error:", squadStatsErr);
    }

    // 1. 📍 맵 마커 제보 승인 대기 건수
    const { count: pendingCount, error: pendingErr } = await adminContext.supabaseAdmin
      .from("pending_markers")
      .select("id", { count: "exact", head: true });

    if (pendingErr) throw pendingErr;

    // 2. ⚡ R2 스토리지 캐시 모니터링
    let r2FileCount = 0;
    let r2TotalSize = 0;
    try {
      const r2Files = await listR2Files(1000);
      r2FileCount = r2Files.length;
      r2TotalSize = r2Files.reduce((sum, f) => sum + f.size, 0);
    } catch (r2Err) {
      console.error("[Dashboard API] R2 storage list error:", r2Err);
    }

    // 3. 📊 PUBG API Rate Limit
    const { data: pubgStatus, error: pubgErr } = await adminContext.supabaseAdmin
      .from("pubg_api_status")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pubgErr) throw pubgErr;

    // 4. 🤖 AI 사용량 및 7일간의 날짜별 누적 비용/토큰 통계
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // 오늘 포함 7일
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const { data: aiLogs, error: aiErr } = await adminContext.supabaseAdmin
      .from("ai_usage_logs")
      .select("created_at, cost_usd, prompt_tokens, completion_tokens")
      .gte("created_at", sevenDaysAgo.toISOString());

    if (aiErr) throw aiErr;

    const dailyStats: Record<string, { cost: number; promptTokens: number; completionTokens: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      dailyStats[dateStr] = { cost: 0, promptTokens: 0, completionTokens: 0 };
    }

    if (aiLogs) {
      aiLogs.forEach(log => {
        const dateStr = new Date(log.created_at).toISOString().split("T")[0];
        if (dailyStats[dateStr]) {
          dailyStats[dateStr].cost += Number(log.cost_usd || 0);
          dailyStats[dateStr].promptTokens += Number(log.prompt_tokens || 0);
          dailyStats[dateStr].completionTokens += Number(log.completion_tokens || 0);
        }
      });
    }

    const aiUsageChartData = Object.entries(dailyStats).map(([date, val]) => ({
      date,
      cost: parseFloat(val.cost.toFixed(6)),
      promptTokens: val.promptTokens,
      completionTokens: val.completionTokens
    }));

    return NextResponse.json({
      pendingMarkersCount: pendingCount || 0,
      r2Cache: {
        fileCount: r2FileCount,
        totalSizeBytes: r2TotalSize
      },
      pubgApi: pubgStatus ? {
        limit: pubgStatus.api_limit,
        remaining: pubgStatus.remaining,
        resetAt: pubgStatus.reset_at,
        updatedAt: pubgStatus.updated_at
      } : null,
      aiUsage: aiUsageChartData,
      squadStats: {
        totalMatches,
        squadMatches,
        estimatedSquadGroups,
        savedApiCalls: totalMatches * 2,
        savedBandwidthBytes: r2TotalSize
      }
    });
  } catch (error: any) {
    console.error("Dashboard API error:", error);
    return NextResponse.json({ error: error.message || "대시보드 데이터를 불러올 수 없습니다." }, { status: 500 });
  }
}
