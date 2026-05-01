import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { matchId, playerNickname, finalResult, telData, matchAttr, rawParticipants } = body;

    if (!matchId || !playerNickname || !finalResult) {
      return NextResponse.json({ error: "Missing required data" }, { status: 400 });
    }

    const lowerNickname = playerNickname.toLowerCase().trim();
    const backgroundTasks = [];

    // 1. match_master_telemetry 저장 (슬림화된 텔레메트리)
    if (telData && matchAttr) {
      backgroundTasks.push(
        supabase.from("match_master_telemetry").upsert({
          match_id: matchId,
          map_name: matchAttr.mapName,
          game_mode: matchAttr.gameMode,
          telemetry_events: telData,
          telemetry_version: 16
        }, { onConflict: 'match_id' })
      );
    }

    // 2. match_stats_raw 저장
    if (rawParticipants && matchAttr) {
      const rawInserts = rawParticipants.map((p: any) => ({
        match_id: matchId,
        player_id: p.attributes.stats.name.toLowerCase().trim(),
        damage: Math.floor(p.attributes.stats.damageDealt),
        kills: p.attributes.stats.kills,
        win_place: p.attributes.stats.winPlace,
        game_mode: matchAttr.gameMode,
        map_name: matchAttr.mapName
      }));
      backgroundTasks.push(supabase.from("match_stats_raw").upsert(rawInserts, { onConflict: 'match_id,player_id' }));
    }

    // 3. global_benchmarks 저장 (고성과자 지표)
    if (finalResult.isValidBenchmark || body.forceBenchmark) {
        const stats = finalResult.stats;
        backgroundTasks.push(
            supabase.from("global_benchmarks").upsert({
                match_id: matchId,
                player_id: lowerNickname,
                damage: Math.floor(stats.damageDealt),
                kills: stats.kills,
                win_place: stats.winPlace,
                game_mode: finalResult.gameMode,
                map_name: finalResult.mapName,
                counter_latency_ms: finalResult.tradeStats.counterLatencyMs,
                initiative_rate: finalResult.initiative_rate,
                revive_rate: finalResult.tradeStats.revCount > 0 ? 100 : 0, // 간소화
                smoke_count: finalResult.itemUseSummary.smokes,
                frag_count: finalResult.itemUseSummary.frags,
                pressure_index: finalResult.combatPressure.pressureIndex,
                enemy_death_distance: finalResult.deathDistance,
                survival_time: Math.round(stats.timeSurvived),
                isolation_index: finalResult.isolationData.isolationIndex,
                filter_version: 2
            }, { onConflict: 'match_id,player_id' })
        );
    }

    // 4. processed_match_telemetry 저장 (최종 결과)
    backgroundTasks.push(
      supabase.from("processed_match_telemetry").upsert({ 
          match_id: matchId, 
          player_id: lowerNickname, 
          data: { fullResult: finalResult }, 
          updated_at: new Date().toISOString() 
      }, { onConflict: 'match_id,player_id' })
    );

    await Promise.allSettled(backgroundTasks);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[INGEST-API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
