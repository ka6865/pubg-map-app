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

  // 공통 정규화 수식
  const latencyScoreBase = input.counterLatencyMs <= 0 ? 0 
    : Math.max(0, Math.min(10, ((3000 - input.counterLatencyMs) / 2000) * 10));

  let combatScore = 0;
  let tacticalScore = 0;
  let survivalScore = 0;

  if (isSolo) {
    // [솔로 모드 (100점 만점)]
    // 1. 전투 (50점): 딜량순위 25 + 선제공격률 15 + 대응속도 10
    const damageScore = input.rankPct <= 0.10 ? 25 : input.rankPct <= 0.25 ? 18 : input.rankPct <= 0.50 ? 12 : 5;
    const initiativeScore = Math.min(15, (input.initiativeRate / 70) * 15);
    combatScore = damageScore + initiativeScore + latencyScoreBase; // latency는 최대 10

    // 2. 전술 (15점): 압박지수 10 + 역전승률 5 (팀플레이 제외)
    const pressureScore = Math.min(10, (input.pressureIndex / 5) * 10);
    const reversalScore = Math.min(5, (input.reversalRate / 100) * 5);
    tacticalScore = pressureScore + reversalScore;

    // 3. 생존 (35점): 사망페이즈 20 + 생존시간 15
    const phaseScore = Math.min(20, (input.deathPhase / 9) * 20);
    const timeScore = Math.min(15, (input.survivalTime / 1800) * 15);
    survivalScore = phaseScore + timeScore;

  } else {
    // [스쿼드/듀오 모드 (100점 만점)]
    // 1. 전투 (40점): 딜량순위 20 + 선제공격률 10 + 대응속도 10
    const damageScore = input.rankPct <= 0.10 ? 20 : input.rankPct <= 0.25 ? 15 : input.rankPct <= 0.50 ? 10 : 5;
    const initiativeScore = Math.min(10, (input.initiativeRate / 70) * 10);
    combatScore = damageScore + initiativeScore + latencyScoreBase;

    // 2. 전술 (35점): 압박지수 10 + 유틸리티 10 + 팀기여 10 + 역전승률 5
    const pressureScore = Math.min(10, (input.pressureIndex / 5) * 10);
    const utilityScore = Math.min(10, (input.smokeRate / 100) * 5 + Math.min(5, input.suppCount / 2));
    const teamScore = Math.min(10, (input.reviveRate / 100) * 4 + (input.tradeRate / 100) * 3 + Math.min(3, input.teamWipes));
    const reversalScore = Math.min(5, (input.reversalRate / 100) * 5);
    tacticalScore = pressureScore + utilityScore + teamScore + reversalScore;

    // 3. 생존 (25점): 사망페이즈 15 + 생존시간 10
    const phaseScore = Math.min(15, (input.deathPhase / 9) * 15);
    const timeScore = Math.min(10, (input.survivalTime / 1800) * 10);
    survivalScore = phaseScore + timeScore;
  }

  return combatScore + tacticalScore + survivalScore;
}

export function getBenchmarkTier(input: MatchTierInput, isSolo: boolean): { tier: string | null, score: number } {
  if (input.survivalTime < 300) return { tier: null, score: 0 };

  const totalScore = calcBenchmarkScore(input, isSolo);

  let tier = 'C';
  if (totalScore >= 75) tier = 'S';
  else if (totalScore >= 55) tier = 'A';
  else if (totalScore >= 35) tier = 'B';

  return { tier, score: Number(totalScore.toFixed(1)) };
}

export function estimateUserTier(avgScore: number): string {
  if (avgScore >= 75) return 'S';
  if (avgScore >= 55) return 'A';
  if (avgScore >= 35) return 'B';
  return 'C';
}
