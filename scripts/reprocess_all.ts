import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { getBenchmarkTier } from '../lib/pubg-analysis/benchmarkScore';
import { RESULT_VERSION } from '../lib/pubg-analysis/constants';

// .env.local 로드
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Supabase 환경 변수가 설정되지 않았습니다. .env.local 파일을 확인하세요.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

const isWriteMode = process.argv.includes('--write');

async function reprocessAll() {
  console.log(`🚀 PUBG 전적 데이터 일괄 재적재(Reprocessing) 시작 - Target Version: ${RESULT_VERSION}`);
  console.log(`📝 실행 모드: ${isWriteMode ? '🔥 실적재 모드 (DB 반영)' : '🔍 시뮬레이션 모드 (Dry-run)'}\n`);

  // 1. 모든 processed_match_telemetry 로드
  const { data: rows, error: fetchError } = await supabase
    .from('processed_match_telemetry')
    .select('match_id, player_id, data')
    .order('updated_at', { ascending: false });

  if (fetchError) {
    console.error('❌ processed_match_telemetry 데이터 로드 실패:', fetchError.message);
    return;
  }

  if (!rows || rows.length === 0) {
    console.log('⚠️ 재적재할 데이터가 없습니다.');
    return;
  }

  console.log(`📊 총 ${rows.length}개의 전적 레코드를 분석합니다.`);

  const tierStatsBefore: Record<string, number> = {};
  const tierStatsAfter: Record<string, number> = {};

  let successCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const data = row.data as any;

    if (!data || !data.fullResult) {
      console.log(`[${i + 1}/${rows.length}] ⚠️ 매치 ${row.match_id} (${row.player_id}) - fullResult가 없어 건너뜁니다.`);
      skippedCount++;
      continue;
    }

    const fullResult = data.fullResult;
    const stats = fullResult.stats;
    const tradeStats = fullResult.tradeStats;
    const duelStats = fullResult.duelStats;
    const combatPressure = fullResult.combatPressure;

    // 이전 티어 기록
    const oldTier = fullResult.benchmark?.tier || 'N/A';
    tierStatsBefore[oldTier] = (tierStatsBefore[oldTier] || 0) + 1;

    // 1. input 매핑
    const isSolo = fullResult.gameMode === 'solo' || fullResult.matchInfo?.mode?.includes('solo');
    const teammateKnocks = tradeStats?.teammateKnocks ?? 0;

    const input = {
      rankPct: fullResult.matchInfo?.rankPct ?? (stats?.winPlace / Math.max(1, fullResult.totalPlayers || 100)),
      survivalTime: stats?.timeSurvived ?? 0,
      initiativeRate: fullResult.initiative_rate ?? -1,
      counterLatencyMs: tradeStats?.counterLatencyMs ?? -1,
      pressureIndex: combatPressure?.pressureIndex ?? 0,
      smokeRate: teammateKnocks > 0 ? ((tradeStats?.smokeRescues ?? 0) / teammateKnocks) * 100 : -1,
      suppCount: tradeStats?.suppCount ?? 0,
      reviveRate: teammateKnocks > 0 ? ((tradeStats?.revCount ?? 0) / teammateKnocks) * 100 : -1,
      tradeRate: teammateKnocks > 0 ? ((tradeStats?.tradeKills ?? 0) / teammateKnocks) * 100 : -1,
      teamWipes: tradeStats?.enemyTeamWipes ?? 0,
      reversalRate: duelStats?.reversalRate ?? -1,
      deathPhase: fullResult.deathPhase ?? 0,
      suppRate: teammateKnocks > 0 ? ((tradeStats?.suppCount ?? 0) / teammateKnocks) * 100 : -1,
    };

    // 2. 신규 티어/점수 연산
    const newBenchmark = getBenchmarkTier(input, isSolo);
    const nextTier = newBenchmark.tier || 'N/A';
    tierStatsAfter[nextTier] = (tierStatsAfter[nextTier] || 0) + 1;

    if (isWriteMode) {
      // 3. fullResult 내부 갱신
      fullResult.benchmark = {
        ...(fullResult.benchmark || {}),
        tier: newBenchmark.tier,
        score: newBenchmark.score,
        breakdown: newBenchmark.breakdown,
      };
      fullResult.v = RESULT_VERSION;

      // 4. Supabase DB 반영 (processed_match_telemetry)
      const { error: updateTelError } = await supabase
        .from('processed_match_telemetry')
        .update({
          data: { fullResult },
          updated_at: new Date().toISOString()
        })
        .eq('match_id', row.match_id)
        .eq('player_id', row.player_id);

      if (updateTelError) {
        console.error(`❌ [${i + 1}/${rows.length}] 매치 ${row.match_id} (${row.player_id}) - telemetry 업데이트 실패:`, updateTelError.message);
        continue;
      }

      // 5. Supabase DB 반영 (global_benchmarks)
      const { error: updateBenchError } = await supabase
        .from('global_benchmarks')
        .update({
          tier: newBenchmark.tier,
          score: newBenchmark.score,
          combat_score: newBenchmark.breakdown.combat,
          tactical_score: newBenchmark.breakdown.tactical,
          survival_score: newBenchmark.breakdown.survival
        })
        .eq('match_id', row.match_id)
        .eq('player_id', row.player_id);

      if (updateBenchError) {
        // 간혹 global_benchmarks에 해당 행이 존재하지 않을 수 있으므로 warning 처리 후 진행
        console.warn(`⚠️ [${i + 1}/${rows.length}] 매치 ${row.match_id} (${row.player_id}) - global_benchmarks 업데이트 경고:`, updateBenchError.message);
      }
    }

    successCount++;
    if ((i + 1) % 50 === 0 || i === rows.length - 1) {
      console.log(`⏳ 진행률: [${i + 1}/${rows.length}] (${Math.round(((i + 1) / rows.length) * 100)}%) 완료`);
    }
  }

  // 결과 리포트 출력
  console.log('\n=========================================');
  console.log('📊 전적 보정 전/후 티어 분포 결과 비교');
  console.log('=========================================');
  const allTiers = Array.from(new Set([...Object.keys(tierStatsBefore), ...Object.keys(tierStatsAfter)])).sort((a, b) => {
    const tierOrder: Record<string, number> = {
      'S+': 14, 'S': 13, 'A+': 12, 'A': 11, 'A-': 10,
      'B+': 9, 'B': 8, 'B-': 7, 'C+': 6, 'C': 5, 'C-': 4,
      'D+': 3, 'D': 2, 'D-': 1, 'N/A': 0
    };
    return (tierOrder[b] || 0) - (tierOrder[a] || 0);
  });

  console.log(`티어\t보정 전\t보정 후\t변화량`);
  console.log(`-----------------------------------------`);
  for (const t of allTiers) {
    const before = tierStatsBefore[t] || 0;
    const after = tierStatsAfter[t] || 0;
    const diff = after - before;
    const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
    console.log(`${t}\t${before}\t${after}\t${diff === 0 ? '-' : diffStr}`);
  }
  console.log(`-----------------------------------------`);
  console.log(`성공: ${successCount}건, 스킵: ${skippedCount}건`);
  console.log('=========================================\n');
  console.log(`✨ 일괄 재적재 프로세스가 완료되었습니다. ${isWriteMode ? '(DB 반영 완료)' : '(시뮬레이션 완료)'}`);
}

reprocessAll().catch(err => {
  console.error('❌ 예기치 못한 에러 발생:', err);
});
