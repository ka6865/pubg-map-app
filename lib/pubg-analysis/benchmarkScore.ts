export interface MatchTierInput {
  rankPct: number;           // 딜량 순위 백분율 (낮을수록 좋음)
  survivalTime: number;      // 생존 시간 (초)
  initiativeRate: number;    // 선제공격률 (0~100)
  counterLatencyMs: number;  // 대응속도 ms (낮을수록 좋음)
  pressureIndex: number;     // 압박 지수
  smokeRate: number;         // 연막 커버율 (0~100)
  suppCount: number;         // 제압사격 횟수
  reviveRate: number;        // 부활률 (0~100)
  tradeRate: number;         // 트레이드 성공률 (0~100)
  teamWipes: number;         // 팀 전멸 기여
  reversalRate: number;      // 역전 승률 (0~100)
  deathPhase: number;        // 사망 페이즈 (0~9)
  suppRate: number;          // 지원사격 확률 (0~100)
}

/**
 * 전술 분석 총점 계산 (0~100점)
 */
export function calcBenchmarkScore(input: MatchTierInput, isSolo: boolean): number {
  if (input.survivalTime < 300) return 0;

  const safeInitiative = input.initiativeRate < 0 ? 35 : input.initiativeRate;
  const safeRevive = input.reviveRate < 0 ? 30 : input.reviveRate;
  const safeTrade = input.tradeRate < 0 ? 30 : input.tradeRate;
  const safeReversal = input.reversalRate < 0 ? 10 : input.reversalRate;
  const safeSmoke = input.smokeRate < 0 ? 30 : input.smokeRate;

  const latencyScoreBase = input.counterLatencyMs < 0 ? 5
    : Math.max(0, Math.min(10, ((3000 - input.counterLatencyMs) / 2000) * 10));

  let combatScore = 0;
  let tacticalScore = 0;
  let survivalScore = 0;

  if (isSolo) {
    const damageScore = input.rankPct <= 0.10 ? 25 : input.rankPct <= 0.25 ? 18 : input.rankPct <= 0.50 ? 12 : 5;
    const initiativeScore = Math.min(15, (safeInitiative / 70) * 15);
    combatScore = damageScore + initiativeScore + latencyScoreBase;

    const pressureScore = Math.min(10, (input.pressureIndex / 5) * 10);
    const reversalScore = Math.min(5, (safeReversal / 100) * 5);
    tacticalScore = pressureScore + reversalScore;

    const phaseScore = Math.min(20, (input.deathPhase / 9) * 20);
    const timeScore = Math.min(15, (input.survivalTime / 1800) * 15);
    survivalScore = phaseScore + timeScore;

  } else {
    const damageScore = input.rankPct <= 0.10 ? 20 : input.rankPct <= 0.25 ? 15 : input.rankPct <= 0.50 ? 10 : 5;
    const initiativeScore = Math.min(10, (safeInitiative / 70) * 10);
    combatScore = damageScore + initiativeScore + latencyScoreBase;

    const pressureScore = Math.min(10, (input.pressureIndex / 5) * 10);
    const utilityScore = Math.min(10, (safeSmoke / 100) * 5 + Math.min(5, input.suppCount / 2));
    const teamScore = Math.min(10, (safeRevive / 100) * 4 + (safeTrade / 100) * 3 + Math.min(3, input.teamWipes));
    const reversalScore = Math.min(5, (safeReversal / 100) * 5);
    tacticalScore = pressureScore + utilityScore + teamScore + reversalScore;

    const phaseScore = Math.min(15, (input.deathPhase / 9) * 15);
    const timeScore = Math.min(10, (input.survivalTime / 1800) * 10);
    survivalScore = phaseScore + timeScore;
  }

  return combatScore + tacticalScore + survivalScore;
}

export interface BenchmarkResult {
  tier: string | null;
  score: number;
  breakdown: {
    combat: number;
    tactical: number;
    survival: number;
  };
}

export function calcBenchmarkScoreDetails(input: MatchTierInput, isSolo: boolean): BenchmarkResult["breakdown"] {
  if (input.survivalTime < 300) return { combat: 0, tactical: 0, survival: 0 };

  const safeInitiative = input.initiativeRate < 0 ? 35 : input.initiativeRate;
  const safeRevive = input.reviveRate < 0 ? 30 : input.reviveRate;
  const safeTrade = input.tradeRate < 0 ? 30 : input.tradeRate;
  const safeReversal = input.reversalRate < 0 ? 10 : input.reversalRate;
  const safeSmoke = input.smokeRate < 0 ? 30 : input.smokeRate;

  const latencyScoreBase = input.counterLatencyMs < 0 ? 5 :
    (input.counterLatencyMs === 0 ? 0 : Math.max(0, Math.min(10, ((3000 - input.counterLatencyMs) / 2000) * 10)));

  let combatScore = 0;
  let tacticalScore = 0;
  let survivalScore = 0;

  if (isSolo) {
    const damageScore = input.rankPct <= 0.10 ? 25 : input.rankPct <= 0.25 ? 18 : input.rankPct <= 0.50 ? 12 : 5;
    const initiativeScore = Math.min(15, (safeInitiative / 70) * 15);
    combatScore = Number((damageScore + initiativeScore + latencyScoreBase).toFixed(1));

    const pressureScore = Math.min(10, (input.pressureIndex / 5) * 10);
    const reversalScore = Math.min(5, (safeReversal / 100) * 5);
    tacticalScore = Number((pressureScore + reversalScore).toFixed(1));

    const phaseScore = Math.min(20, (input.deathPhase / 9) * 20);
    const timeScore = Math.min(15, (input.survivalTime / 1800) * 15);
    survivalScore = Number((phaseScore + timeScore).toFixed(1));

  } else {
    const damageScore = input.rankPct <= 0.10 ? 20 : input.rankPct <= 0.25 ? 15 : input.rankPct <= 0.50 ? 10 : 5;
    const initiativeScore = Math.min(10, (safeInitiative / 70) * 10);
    combatScore = Number((damageScore + initiativeScore + latencyScoreBase).toFixed(1));

    const pressureScore = Math.min(10, (input.pressureIndex / 5) * 10);
    const utilityScore = Math.min(10, (safeSmoke / 100) * 5 + Math.min(5, input.suppCount / 2));
    const teamScore = Math.min(10, (safeRevive / 100) * 4 + (safeTrade / 100) * 3 + Math.min(3, input.teamWipes));
    const reversalScore = Math.min(5, (safeReversal / 100) * 5);
    tacticalScore = Number((pressureScore + utilityScore + teamScore + reversalScore).toFixed(1));

    const phaseScore = Math.min(15, (input.deathPhase / 9) * 15);
    const timeScore = Math.min(10, (input.survivalTime / 1800) * 10);
    survivalScore = Number((phaseScore + timeScore).toFixed(1));
  }

  return { combat: combatScore, tactical: tacticalScore, survival: survivalScore };
}

/**
 * 세분화된 13단계 티어 판정 (S ~ D-)
 */
export function getBenchmarkTier(input: MatchTierInput, isSolo: boolean): BenchmarkResult {
  if (input.survivalTime < 300) return { tier: null, score: 0, breakdown: { combat: 0, tactical: 0, survival: 0 } };

  const breakdown = calcBenchmarkScoreDetails(input, isSolo);
  const s = breakdown.combat + breakdown.tactical + breakdown.survival;
  const totalScore = Number(s.toFixed(1));

  let tier = 'D-';
  if (totalScore >= 85) tier = 'S';
  else if (totalScore >= 78) tier = 'A+';
  else if (totalScore >= 71) tier = 'A';
  else if (totalScore >= 64) tier = 'A-';
  else if (totalScore >= 56) tier = 'B+';
  else if (totalScore >= 48) tier = 'B';
  else if (totalScore >= 40) tier = 'B-';
  else if (totalScore >= 32) tier = 'C+';
  else if (totalScore >= 24) tier = 'C';
  else if (totalScore >= 16) tier = 'C-';
  else if (totalScore >= 10) tier = 'D+';
  else if (totalScore >= 5) tier = 'D';

  return { tier, score: totalScore, breakdown };
}

/**
 * 세부 티어를 벤치마크 조회용 베이스 티어(S, A, B, C, D)로 변환
 */
export function getBaseTier(tier: string | null): string {
  if (!tier) return 'C';
  if (tier === 'S') return 'S';
  if (tier.startsWith('A')) return 'A';
  if (tier.startsWith('B')) return 'B';
  if (tier.startsWith('C')) return 'C';
  if (tier.startsWith('D')) return 'D';
  return 'C';
}

/**
 * 평균 점수 기반 사용자 대표 티어 추정
 */
/**
 * 티어 점수 경계값 정의
 */
export const TIER_THRESHOLDS = [
  { tier: 'S', min: 85 },
  { tier: 'A+', min: 78 },
  { tier: 'A', min: 71 },
  { tier: 'A-', min: 64 },
  { tier: 'B+', min: 56 },
  { tier: 'B', min: 48 },
  { tier: 'B-', min: 40 },
  { tier: 'C+', min: 32 },
  { tier: 'C', min: 24 },
  { tier: 'C-', min: 16 },
  { tier: 'D+', min: 10 },
  { tier: 'D', min: 5 },
  { tier: 'D-', min: 0 },
];

/**
 * 평균 점수 기반 사용자 대표 티어 추정
 */
export function estimateUserTier(avgScore: number): string {
  const found = TIER_THRESHOLDS.find(t => avgScore >= t.min);
  return found ? found.tier : 'D-';
}

/**
 * 다음 티어까지 필요한 점수 정보 조회
 */
export function getNextTierInfo(currentScore: number) {
  const currentTier = estimateUserTier(currentScore);
  if (currentTier === 'S') return null;

  const currentIndex = TIER_THRESHOLDS.findIndex(t => t.tier === currentTier);
  if (currentIndex <= 0) return null;

  const nextTier = TIER_THRESHOLDS[currentIndex - 1];
  return {
    tier: nextTier.tier,
    needed: Number((nextTier.min - currentScore).toFixed(1))
  };
}
