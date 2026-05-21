import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

import { normalizeName } from "@/lib/pubg-analysis/utils";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { matchId, playerNickname, finalResult, telData, matchAttr, rawParticipants } = body;

    if (!matchId || !playerNickname || !finalResult) {
      return NextResponse.json({ error: "Missing required data" }, { status: 400 });
    }

    const lowerNickname = normalizeName(playerNickname);
    const backgroundTasks = [];

    // 1. match_master_telemetry 저장은 match route에서 처리하므로 중복 방지를 위해 제거 (성능 최적화)

    // 2. match_stats_raw 저장
    if (rawParticipants && matchAttr) {
      const rawInserts = rawParticipants.map((p: any) => ({
        match_id: matchId,
        player_id: normalizeName(p.attributes.stats.name),
        damage: Math.floor(p.attributes.stats.damageDealt),
        kills: p.attributes.stats.kills,
        win_place: p.attributes.stats.winPlace,
        game_mode: matchAttr.gameMode,
        map_name: matchAttr.mapName
      }));
      backgroundTasks.push(supabase.from("match_stats_raw").upsert(rawInserts, { onConflict: 'match_id,player_id' }));

      // [V55.0] 자동완성 데이터베이스 확장: 모든 참여자를 캐시에 등록 (데드락 방지를 위해 Ingest에서만 수행)
      const playerCacheInserts = rawParticipants
        .filter((p: any) => !p.attributes.stats.playerId?.startsWith("ai."))
        .map((p: any) => ({
          id: p.attributes.stats.playerId || p.id,
          platform: matchAttr.platformId || "steam",
          nickname: p.attributes.stats.name,
          lower_nickname: p.attributes.stats.name.toLowerCase(),
          updated_at: new Date().toISOString()
        }));

      // [V55.1] 25개 배치로 분할하여 Supabase statement_timeout 방지
      // (한번에 100개 upsert → DB timeout 간헐적 발생)
      const BATCH_SIZE = 25;
      const batches: typeof playerCacheInserts[] = [];
      for (let i = 0; i < playerCacheInserts.length; i += BATCH_SIZE) {
        batches.push(playerCacheInserts.slice(i, i + BATCH_SIZE));
      }
      // fire-and-forget — 실패해도 메인 로직 영향 없음
      (async () => {
        for (const batch of batches) {
          const { error } = await supabase
            .from("pubg_player_cache")
            .upsert(batch, { onConflict: "id" });
          if (error) console.warn("[INGEST] Player cache batch upsert failed:", error.message);
        }
      })();
    }

    // 3. global_benchmarks 저장 (고성과자 지표)
    // [V55.2] 아케이드/TDM/훈련장 데이터 오염 방지 필터 (대소문자 무시)
    const matchTypeLower = (finalResult.matchType || "").toLowerCase();
    const gameModeLower = (finalResult.gameMode || "").toLowerCase();
    const isStandardBR = (matchTypeLower === 'official' || matchTypeLower === 'competitive') && 
                         (gameModeLower !== 'tdm' && gameModeLower !== 'trainingroom');

    if ((finalResult.isValidBenchmark || body.forceBenchmark) && isStandardBR) {
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
          revive_rate: ((finalResult.tradeStats?.revCount || 0) / Math.max(1, finalResult.tradeStats?.teammateKnocks || 0)) * 100,
          is_crossfire: finalResult.isolationData?.isCrossfire || false,
          utility_count: finalResult.combatPressure?.utilityStats?.throwCount || 0,
          smoke_count: finalResult.itemUseSummary?.smokes || 0,
          frag_count: finalResult.itemUseSummary?.frags || 0,
          pressure_index: finalResult.combatPressure?.pressureIndex || 0,
          enemy_death_distance: finalResult.deathDistance || 0,
          survival_time: Math.round(stats.timeSurvived),
          isolation_index: finalResult.isolationData?.isolationIndex || 0,
          min_dist: finalResult.isolationData?.minDist || 0,
          height_diff: finalResult.isolationData?.heightDiff || 0,
          smoke_rate: ((finalResult.tradeStats?.smokeRescues || 0) / Math.max(1, finalResult.tradeStats?.teammateKnocks || 0)) * 100,
          trade_rate: (Math.min(finalResult.tradeStats?.teammateKnocks || 0, finalResult.tradeStats?.tradeKills || 0) / Math.max(1, finalResult.tradeStats?.teammateKnocks || 0)) * 100,
          solo_kill_rate: ((finalResult.killContribution?.solo || 0) / Math.max(1, (finalResult.killContribution?.solo || 0) + (finalResult.killContribution?.assist || 0) + (finalResult.killContribution?.cleanup || 0))) * 100,
          reversal_rate: finalResult.duelStats?.reversalRate || 0,
          duel_win_rate: finalResult.duelStats?.duelWinRate || 0,
          trade_latency_ms: finalResult.tradeStats?.tradeLatencyMs || 0,
          lethal_throw_count: finalResult.itemUseStats?.lethalThrowCount || 0,
          tier: finalResult.benchmark?.tier || 'C',
          score: finalResult.benchmark?.score || 0,
          combat_score: finalResult.benchmark?.breakdown?.combat || 0,
          tactical_score: finalResult.benchmark?.breakdown?.tactical || 0,
          survival_score: finalResult.benchmark?.breakdown?.survival || 0,
          supp_count: finalResult.tradeStats?.suppCount || 0,
          team_wipes: finalResult.tradeStats?.enemyTeamWipes || 0,
          match_type: finalResult.matchType || 'Official',
          death_phase: finalResult.deathPhase || 0,
          filter_version: 8
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
