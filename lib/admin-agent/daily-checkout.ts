import type { AgentNextAction } from "./next-actions";

export type AgentDailyCheckout = {
  status: "clear" | "attention" | "blocked";
  label: string;
  score: number;
  summary: string;
  completedSignals: string[];
  openRisks: string[];
  tomorrowFocus: string[];
  handoffPrompt: string;
};

export function buildAgentDailyCheckout(input: {
  severity: "ok" | "warn" | "critical";
  pendingApprovals: { count: number; highRiskCount?: number; staleCount?: number };
  approvalGateSummary?: { blockCount?: number; reviewCount?: number };
  failedRuns: { count: number };
  apiErrors: { total: number };
  aiUsage: { totalRequests: number; totalCostUsd: number };
  readinessStatus?: "ok" | "warn" | "critical";
  rolloutStatus?: "pass" | "warn" | "fail";
  deploymentSeverity?: "ok" | "warn" | "critical";
  nextActions: AgentNextAction[];
  latestReport?: { item?: { title?: string } | null };
}): AgentDailyCheckout {
  const openRisks = [
    ...(input.approvalGateSummary?.blockCount ? [`Execution Gate block ${input.approvalGateSummary.blockCount}건`] : []),
    ...(input.pendingApprovals.staleCount ? [`오래된 승인 ${input.pendingApprovals.staleCount}건`] : []),
    ...(input.pendingApprovals.highRiskCount ? [`고위험 승인 ${input.pendingApprovals.highRiskCount}건`] : []),
    ...(input.failedRuns.count ? [`실패한 agent run ${input.failedRuns.count}건`] : []),
    ...(input.apiErrors.total ? [`PUBG API 에러 ${input.apiErrors.total}건`] : []),
    ...(input.deploymentSeverity && input.deploymentSeverity !== "ok" ? [`배포 상태 ${input.deploymentSeverity}`] : []),
    ...(input.readinessStatus && input.readinessStatus !== "ok" ? [`agent readiness ${input.readinessStatus}`] : []),
    ...(input.rolloutStatus && input.rolloutStatus !== "pass" ? [`rollout readiness ${input.rolloutStatus}`] : [])
  ];

  const completedSignals = [
    input.latestReport?.item?.title ? `최근 리포트: ${input.latestReport.item.title}` : "최근 리포트 없음",
    input.aiUsage.totalRequests ? `AI 요청 ${input.aiUsage.totalRequests}건 추적됨` : "AI 비용 신호 정상",
    input.pendingApprovals.count ? `승인 대기 ${input.pendingApprovals.count}건 추적 중` : "승인 대기 없음",
    input.apiErrors.total ? "PUBG API 에러 감시 중" : "PUBG API 에러 없음",
    input.failedRuns.count ? "실패 run 감시 중" : "Agent run 실패 없음"
  ].slice(0, 5);

  const penalty = (
    (input.approvalGateSummary?.blockCount || 0) * 22
    + (input.pendingApprovals.staleCount || 0) * 16
    + (input.pendingApprovals.highRiskCount || 0) * 12
    + input.failedRuns.count * 18
    + input.apiErrors.total * 4
    + (input.deploymentSeverity === "critical" ? 22 : input.deploymentSeverity === "warn" ? 10 : 0)
    + (input.readinessStatus === "critical" ? 24 : input.readinessStatus === "warn" ? 10 : 0)
    + (input.rolloutStatus === "fail" ? 18 : input.rolloutStatus === "warn" ? 8 : 0)
  );
  const score = clampScore(100 - penalty);
  const status = getCheckoutStatus(input.severity, score, openRisks.length, input.approvalGateSummary?.blockCount || 0);
  const topActions = input.nextActions.slice(0, 3);

  return {
    status,
    label: status === "clear" ? "마감 가능" : status === "attention" ? "주의 후 마감" : "마감 차단",
    score,
    summary: buildSummary(status, score, openRisks, topActions),
    completedSignals,
    openRisks: openRisks.length ? openRisks.slice(0, 6) : ["남은 위험 신호 없음"],
    tomorrowFocus: topActions.length
      ? topActions.map((action) => `${action.title}: ${action.expectedOutcome}`).slice(0, 3)
      : ["정상 운영 digest를 저장하고 콘텐츠 성과를 점검"],
    handoffPrompt: topActions[0]?.prompt || "오늘 운영 브리핑을 리포트로 저장 요청해줘"
  };
}

function getCheckoutStatus(severity: "ok" | "warn" | "critical", score: number, riskCount: number, blockedGateCount: number) {
  if (blockedGateCount > 0 || severity === "critical" || score < 55) return "blocked";
  if (severity === "warn" || riskCount > 0 || score < 80) return "attention";
  return "clear";
}

function buildSummary(status: AgentDailyCheckout["status"], score: number, risks: string[], actions: AgentNextAction[]) {
  if (status === "clear") return `마감 점수 ${score}/100입니다. 운영 상태가 정상 범위라 Daily Ops Digest 저장만 권장됩니다.`;
  const firstRisk = risks[0] || "검토할 운영 신호";
  const firstAction = actions[0]?.title || "운영 브리핑 확인";
  if (status === "attention") return `마감 점수 ${score}/100입니다. ${firstRisk} 확인 후 ${firstAction}을 처리하면 마감 가능합니다.`;
  return `마감 점수 ${score}/100입니다. ${firstRisk} 때문에 마감 전 ${firstAction} 처리가 필요합니다.`;
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}
