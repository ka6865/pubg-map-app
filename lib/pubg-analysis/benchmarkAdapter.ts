/**
 * benchmark_stats_by_tier 뷰의 snake_case 데이터를 
 * AI 프롬프트 및 앱 내 표준인 camelCase로 변환하고 정규화하는 어댑터
 */

export interface RawTierBenchmark {
  game_mode: string;
  match_type: string;
  tier: string;
  avg_damage: number;
  avg_kills: number;
  avg_survival_time: number;
  avg_duel_win_rate: number;
  avg_initiative_rate: number;
  avg_trade_rate: number;
  avg_revive_rate: number;
  avg_smoke_rate: number;
  avg_pressure_index: number;
  avg_team_wipes: number;
  avg_reversal_rate: number;
  avg_isolation_index: number;
  avg_min_dist: number;
  avg_counter_latency_ms: number;
  avg_trade_latency_ms: number;
  avg_solo_kill_rate: number;
  avg_death_phase: number;
  sample_count?: number;
}

export interface NormalizedBenchmark {
  avgDamage: number;
  avgKills: number;
  avgSurvivalTime: number;
  avgDuelWinRate: number;
  avgInitiativeRate: number;
  avgTradeRate: number;
  avgReviveRate: number;
  avgSmokeRate: number;
  avgPressureIndex: number;
  avgTeamWipes: number;
  avgReversalRate: number;
  // 추가된 필드들
  avgIsolationIndex: number;
  avgMinDist: number;
  avgCounterLatency: number;
  avgTradeLatency: number;
  avgSoloKillRate: number;
  avgDeathPhase: number;
}

/**
 * 비율 지표(0~100)를 안전하게 클램핑하고 정규화합니다.
 */
function normalizeRate(value: number | undefined | null, defaultValue: number = 0): number {
  if (value === undefined || value === null || isNaN(value)) return defaultValue;
  // 만약 DB 값이 0~1 범위라면 100을 곱함
  const normalized = value <= 1 && value > 0 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

/**
 * 일반 수치 지표를 안전하게 처리합니다.
 */
function normalizeValue(value: number | undefined | null, defaultValue: number = 0): number {
  if (value === undefined || value === null || isNaN(value)) return defaultValue;
  return Math.max(0, value);
}

export function adaptBenchmark(raw: any): NormalizedBenchmark {
  // 기본값 설정 (티어 데이터가 없을 경우를 대비한 폴백)
  const defaultValues: NormalizedBenchmark = {
    avgDamage: 250,
    avgKills: 2.5,
    avgSurvivalTime: 900,
    avgDuelWinRate: 50,
    avgInitiativeRate: 35,
    avgTradeRate: 30,
    avgReviveRate: 30,
    avgSmokeRate: 40,
    avgPressureIndex: 2.0,
    avgTeamWipes: 0.2,
    avgReversalRate: 15,
    avgIsolationIndex: 2.5,
    avgMinDist: 15,
    avgCounterLatency: 0.5,
    avgTradeLatency: 12.0,
    avgSoloKillRate: 50,
    avgDeathPhase: 6
  };

  if (!raw) return defaultValues;

  return {
    avgDamage: Math.round(normalizeValue(raw.avg_damage, defaultValues.avgDamage)),
    avgKills: Number(normalizeValue(raw.avg_kills, defaultValues.avgKills).toFixed(1)),
    avgSurvivalTime: Math.round(normalizeValue(raw.avg_survival_time, defaultValues.avgSurvivalTime)),
    avgDuelWinRate: normalizeRate(raw.avg_duel_win_rate, defaultValues.avgDuelWinRate),
    avgInitiativeRate: normalizeRate(raw.avg_initiative_rate, defaultValues.avgInitiativeRate),
    avgTradeRate: normalizeRate(raw.avg_trade_rate, defaultValues.avgTradeRate),
    avgReviveRate: normalizeRate(raw.avg_revive_rate, defaultValues.avgReviveRate),
    avgSmokeRate: normalizeRate(raw.avg_smoke_rate, defaultValues.avgSmokeRate),
    avgPressureIndex: Number(normalizeValue(raw.avg_pressure_index, defaultValues.avgPressureIndex).toFixed(2)),
    avgTeamWipes: Number(normalizeValue(raw.avg_team_wipes, defaultValues.avgTeamWipes).toFixed(2)),
    avgReversalRate: normalizeRate(raw.avg_reversal_rate, defaultValues.avgReversalRate),
    avgIsolationIndex: Number(normalizeValue(raw.avg_isolation_index, defaultValues.avgIsolationIndex).toFixed(2)),
    avgMinDist: Math.round(normalizeValue(raw.avg_min_dist, defaultValues.avgMinDist)),
    avgCounterLatency: Number(normalizeValue((raw.avg_counter_latency_ms || raw.avg_counter_latency) / 1000, defaultValues.avgCounterLatency).toFixed(2)),
    avgTradeLatency: Number(normalizeValue((raw.avg_trade_latency_ms || raw.avg_trade_latency) / 1000, defaultValues.avgTradeLatency).toFixed(2)),
    avgSoloKillRate: normalizeRate(raw.avg_solo_kill_rate, defaultValues.avgSoloKillRate),
    avgDeathPhase: Number(normalizeValue(raw.avg_death_phase, defaultValues.avgDeathPhase).toFixed(1)),
  };
}
