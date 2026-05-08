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
}

export function calcBenchmarkScore(input: MatchTierInput, isSolo: boolean): number {
  if (input.survivalTime < 300) return 0; // 최소 생존 시간 미달 시 0점 (기록 안됨)

  // 공통 정규화 수식 (N/A인 -1 값 처리 추가)
  const safeInitiative = input.initiativeRate < 0 ? 35 : input.initiativeRate; // N/A면 평균 35%로 간주
  const safeRevive = input.reviveRate < 0 ? 30 : input.reviveRate;
  const safeTrade = input.tradeRate < 0 ? 30 : input.tradeRate;
  const safeReversal = input.reversalRate < 0 ? 10 : input.reversalRate;
  const safeSmoke = input.smokeRate < 0 ? 30 : input.smokeRate;

  // 대응속도 점수: N/A면 중간 점수인 5점 부여
  const latencyScoreBase = input.counterLatencyMs < 0 ? 5 
    : input.counterLatencyMs === 0 ? 0
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

  const latencyScoreBase = input.counterLatencyMs < 0 ? 5 
    : input.counterLatencyMs === 0 ? 0
    : Math.max(0, Math.min(10, ((3000 - input.counterLatencyMs) / 2000) * 10));

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

export function getBenchmarkTier(input: MatchTierInput, isSolo: boolean): BenchmarkResult {
  if (input.survivalTime < 300) return { tier: null, score: 0, breakdown: { combat: 0, tactical: 0, survival: 0 } };

  const breakdown = calcBenchmarkScoreDetails(input, isSolo);
  const totalScore = breakdown.combat + breakdown.tactical + breakdown.survival;

  let tier = 'C';
  if (totalScore >= 75) tier = 'S';
  else if (totalScore >= 55) tier = 'A';
  else if (totalScore >= 35) tier = 'B';

  return { tier, score: Number(totalScore.toFixed(1)), breakdown };
}

export function estimateUserTier(avgScore: number): string {
  if (avgScore >= 75) return 'S';
  if (avgScore >= 55) return 'A';
  if (avgScore >= 35) return 'B';
  return 'C';
}
