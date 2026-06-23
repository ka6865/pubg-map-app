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
  isolationIndex?: number;   // 고립 지수 (스쿼드 전용, 0~5)
  // [V69.0] 생존 점수 고도화 필드
  survivalRankPct: number;   // 생존 순위 비율 (0~1, winPlace / maxPlace)
  myKnockCount: number;      // 내가 기절당한 횟수 (myKnockEvents.length)
  myDeathCount: number;      // 내가 사망한 횟수 (0 또는 1)
  winPlace: number;          // 최종 순위 (1~100)
  kills?: number;            // 킬 수
  damageDealt?: number;      // 유효 딜량
  teamDamageShare?: number;  // 팀 내 딜량 비중 (0~100)
  safeRevivesWithoutSmoke?: number; // 연막 없이 안전하게 완료한 소생 추정 수
}

/**
 * 전술 분석 총점 계산 (0~100점)
 */
export function calcBenchmarkScore(input: MatchTierInput, isSolo: boolean): number {
  const result = getBenchmarkTier(input, isSolo);
  return result.score;
}

export interface BenchmarkResult {
  tier: string | null;
  score: number;
  breakdown: {
    combat: number;
    tactical: number;
    survival: number;
    highlightBonus?: number;
  };
  highlightBonus?: number;
  highlightReasons?: string[];
}

function getHighlightBonus(input: MatchTierInput, isSolo: boolean): { bonus: number; reasons: string[] } {
  if (input.survivalTime < 300) return { bonus: 0, reasons: [] };

  const reasons: string[] = [];
  let bonus = 0;
  const kills = input.kills || 0;
  const damageDealt = input.damageDealt || 0;
  const teamDamageShare = input.teamDamageShare || 0;
  const isWinner = input.winPlace === 1;
  const isTopDamageOutlier = input.rankPct <= 0.03;

  if (isWinner) {
    bonus += 1.5;
    reasons.push("1등 보너스");
  }
  if (kills >= 10) {
    bonus += 1.5;
    reasons.push("10킬 이상 캐리");
  } else if (kills >= 7) {
    bonus += 0.8;
    reasons.push("7킬 이상 고화력");
  }
  if (damageDealt >= 1000 || isTopDamageOutlier) {
    bonus += 1.5;
    reasons.push(damageDealt >= 1000 ? "1000딜 이상" : "딜량 상위 3%");
  }
  if (!isSolo && teamDamageShare >= 45) {
    bonus += 1;
    reasons.push("팀 화력 핵심 기여");
  }
  if (!isSolo && input.teamWipes >= 4) {
    bonus += 1.5;
    reasons.push("적 팀 전멸 다수 기여");
  } else if (!isSolo && input.teamWipes >= 2) {
    bonus += 0.8;
    reasons.push("적 팀 전멸 기여");
  }
  if (!isSolo && (input.safeRevivesWithoutSmoke || 0) > 0) {
    bonus += 1;
    reasons.push("연막 없이 안전 소생");
  }

  const riskPenalty = input.survivalTime < 600 || (input.myDeathCount > 0 && input.deathPhase <= 3) || (input.isolationIndex || 0) >= 4.5
    ? 0.5
    : 1;
  const cappedBonus = Math.min(8, bonus * riskPenalty);

  return {
    bonus: Number(cappedBonus.toFixed(1)),
    reasons,
  };
}

export function calcBenchmarkScoreDetails(input: MatchTierInput, isSolo: boolean): BenchmarkResult["breakdown"] {
  if (input.survivalTime < 300) return { combat: 0, tactical: 0, survival: 0 };

  // 조기 탈락 조건 판단 (10분 미만 생존 혹은 3페이즈 이하 사망)
  const isEarlyDeath = input.survivalTime < 600 || (input.myDeathCount > 0 && input.deathPhase <= 3);

  // 상황별 폴백 값 분기 대입
  const safeInitiative = input.initiativeRate < 0 ? 45 : input.initiativeRate;
  // [V68.0] 기회 없음(-1)인 경우, 조기 광탈은 30%만 인정하되 정상 탈락은 무결점 우대로 100% 만점 처리.
  const safeRevive = input.reviveRate < 0 ? (isEarlyDeath ? 30 : 100) : input.reviveRate;
  const safeTrade = input.tradeRate < 0 ? (isEarlyDeath ? 30 : 100) : input.tradeRate;
  const safeSmoke = input.smokeRate < 0 ? (isEarlyDeath ? 30 : 100) : input.smokeRate;
  const safeSuppRate = input.suppRate < 0 ? (isEarlyDeath ? 30 : 100) : input.suppRate;
  const safeReversal = input.reversalRate < 0 ? (isEarlyDeath ? 10 : 50) : input.reversalRate;

  const latencyScoreBase = input.counterLatencyMs < 0 ? 5 :
    (input.counterLatencyMs === 0 ? 0 : Math.max(0, Math.min(10, ((3000 - input.counterLatencyMs) / 2000) * 10)));

  let combatScore = 0;
  let tacticalScore = 0;
  let survivalScore = 0;

  if (isSolo) {
    const damageScore = input.rankPct <= 0.10 ? 25 : input.rankPct <= 0.25 ? 18 : input.rankPct <= 0.50 ? 12 : 5;
    const initiativeScore = Math.min(15, (safeInitiative / 60) * 15); // 70% -> 60% 완화
    combatScore = Number((damageScore + initiativeScore + latencyScoreBase).toFixed(1));

    const pressureScore = Math.min(10, (input.pressureIndex / 5) * 10);
    const reversalScore = Math.min(5, (safeReversal / 100) * 5);
    tacticalScore = Number((pressureScore + reversalScore).toFixed(1));

    // [V69.0] 솔로 생존 점수 개편 (사망페이즈/생존시간 중복 해소 및 맵 크기 왜곡 방지)
    const safeSurvivalRankPct = Math.max(0, Math.min(1, input.survivalRankPct));
    const rankScore = Math.min(30, (1 - safeSurvivalRankPct) * 30);
    const top10Score = input.winPlace <= 10 ? 5 : 0;
    survivalScore = Number((rankScore + top10Score).toFixed(1));

  } else {
    const damageScore = input.rankPct <= 0.10 ? 20 : input.rankPct <= 0.25 ? 15 : input.rankPct <= 0.50 ? 10 : 5;
    const initiativeScore = Math.min(10, (safeInitiative / 60) * 10); // 70% -> 60% 완화
    combatScore = Number((damageScore + initiativeScore + latencyScoreBase).toFixed(1));

    const pressureScore = Math.min(10, (input.pressureIndex / 5) * 10);
    const utilityScore = Math.min(10, (safeSmoke / 100) * 5 + Math.min(5, input.suppCount / 1.2)); // 10회 -> 6회 완화
    const teamScore = Math.min(10, (safeRevive / 100) * 3 + (safeTrade / 100) * 2 + (safeSuppRate / 100) * 2 + Math.min(3, input.teamWipes * 1.5));
    const reversalScore = Math.min(5, (safeReversal / 100) * 5);
    
    const rawTactical = pressureScore + utilityScore + teamScore + reversalScore;

    // [V68.0] 스쿼드 모드 고립 지수 페널티 차감 (솔로 제외)
    const isolationPenalty = (input.isolationIndex && input.isolationIndex >= 3.5)
      ? Math.min(3, (input.isolationIndex - 3.5) * 2) : 0;
    
    tacticalScore = Number(Math.max(0, rawTactical - isolationPenalty).toFixed(1));

    // [V69.0] 스쿼드 생존 점수 개편 (생존 순위 비율 20점 + 기절 후 생존 관리력 5점)
    const safeSurvivalRankPct = Math.max(0, Math.min(1, input.survivalRankPct));
    const rankScore = Math.min(20, (1 - safeSurvivalRankPct) * 20);
    let groggyScore = 5;
    if (input.myKnockCount > 0) {
      const knockSurvivalRate = 1 - (input.myDeathCount / input.myKnockCount);
      groggyScore = Math.min(5, knockSurvivalRate * 5);
    } else if (input.myDeathCount === 1) {
      groggyScore = 0; // 한 번도 기절 없이 바로 즉사한 경우
    }
    survivalScore = Number((rankScore + groggyScore).toFixed(1));
  }

  return { combat: combatScore, tactical: tacticalScore, survival: survivalScore };
}

/**
 * 세분화된 13단계 티어 판정 (S ~ D-)
 */
export function getBenchmarkTier(input: MatchTierInput, isSolo: boolean): BenchmarkResult {
  if (input.survivalTime < 300) return { tier: null, score: 0, breakdown: { combat: 0, tactical: 0, survival: 0 } };

  const breakdown = calcBenchmarkScoreDetails(input, isSolo);
  const highlight = getHighlightBonus(input, isSolo);
  const s = breakdown.combat + breakdown.tactical + breakdown.survival + highlight.bonus;
  const totalScore = Number(s.toFixed(1));

  let tier = 'D-';
  if (totalScore >= 90) tier = 'S+';
  else if (totalScore >= 82) tier = 'S';
  else if (totalScore >= 75) tier = 'A+';
  else if (totalScore >= 68) tier = 'A';
  else if (totalScore >= 60) tier = 'A-';
  else if (totalScore >= 52) tier = 'B+';
  else if (totalScore >= 44) tier = 'B';
  else if (totalScore >= 36) tier = 'B-';
  else if (totalScore >= 28) tier = 'C+';
  else if (totalScore >= 20) tier = 'C';
  else if (totalScore >= 12) tier = 'C-';
  else if (totalScore >= 6) tier = 'D+';
  else if (totalScore >= 3) tier = 'D';

  return {
    tier,
    score: Math.min(100, totalScore),
    breakdown: {
      ...breakdown,
      highlightBonus: highlight.bonus,
    },
    highlightBonus: highlight.bonus,
    highlightReasons: highlight.reasons,
  };
}

/**
 * 세부 티어를 벤치마크 조회용 베이스 티어(S, A, B, C, D)로 변환
 */
export function getBaseTier(tier: string | null): string {
  if (!tier) return 'C';
  if (tier === 'S+' || tier === 'S') return 'S';
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
  { tier: 'S+', min: 90 },
  { tier: 'S', min: 82 },
  { tier: 'A+', min: 75 },
  { tier: 'A', min: 68 },
  { tier: 'A-', min: 60 },
  { tier: 'B+', min: 52 },
  { tier: 'B', min: 44 },
  { tier: 'B-', min: 36 },
  { tier: 'C+', min: 28 },
  { tier: 'C', min: 20 },
  { tier: 'C-', min: 12 },
  { tier: 'D+', min: 6 },
  { tier: 'D', min: 3 },
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
  if (currentTier === 'S+') return null;

  const currentIndex = TIER_THRESHOLDS.findIndex(t => t.tier === currentTier);
  if (currentIndex <= 0) return null;

  const nextTier = TIER_THRESHOLDS[currentIndex - 1];
  return {
    tier: nextTier.tier,
    needed: Number((nextTier.min - currentScore).toFixed(1))
  };
}
