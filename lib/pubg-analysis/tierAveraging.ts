import { estimateUserTier } from "./benchmarkScore";

export const TIER_FALLBACK_SCORES: Record<string, number> = {
  "S+": 95,
  S: 90,
  "A+": 80,
  A: 75,
  "A-": 68,
  "B+": 60,
  B: 52,
  "B-": 44,
  "C+": 36,
  C: 28,
  "C-": 20,
  "D+": 12,
  D: 6,
  "D-": 0
};

export function estimateAverageTierFromRows(rows: any[]): string {
  if (!rows.length) return "D-";

  const scores = rows
    .map(row => Number(row.score))
    .filter(score => Number.isFinite(score) && score > 0);

  if (scores.length > 0) {
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    return estimateUserTier(avgScore);
  }

  const avgFallbackScore = rows.reduce((sum, row) => {
    return sum + (TIER_FALLBACK_SCORES[row.tier as string] ?? 0);
  }, 0) / rows.length;

  return estimateUserTier(avgFallbackScore);
}
