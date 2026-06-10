export type AgentOperatorValueScorecard = {
  generatedAt: string;
  score: number;
  label: "excellent" | "useful" | "warming_up" | "needs_attention";
  summary: string;
  metrics: Array<{
    id: "time_saved" | "risk_prevented" | "automation_coverage" | "learning_loop" | "content_leverage";
    label: string;
    value: string;
    detail: string;
    score: number;
  }>;
  wins: string[];
  nextLeverage: Array<{
    title: string;
    reason: string;
    prompt: string;
  }>;
};

export function buildOperatorValueScorecard(input: {
  recentAgentActivity?: {
    totalRuns: number;
    completedRuns: number;
    failedRuns: number;
    monitorRuns: number;
  };
  approvalOutcomes?: {
    executed: number;
    rejected: number;
    failed: number;
  };
  pendingApprovals?: {
    count: number;
    highRiskCount?: number;
    staleCount?: number;
  };
  approvalGateSummary?: {
    blockCount?: number;
    reviewCount?: number;
  };
  failedRuns?: { count: number };
  apiErrors?: { total: number };
  aiUsage?: { totalRequests?: number; totalCostUsd: number };
  latestMonitorSnapshot?: any;
  todayActionBoard?: any;
  memorySuggestions?: any[];
  relatedMemories?: { items?: any[] };
  contentPerformance?: {
    totalPosts?: number;
    totalViews?: number;
    recommendations?: string[];
    weeklyPlan?: any[];
  };
  capabilityMatrix?: {
    score: number;
    items?: Array<{ status: "ready" | "partial" | "blocked" }>;
  };
}): AgentOperatorValueScorecard {
  const activity = input.recentAgentActivity || { totalRuns: 0, completedRuns: 0, failedRuns: 0, monitorRuns: 0 };
  const approvals = input.approvalOutcomes || { executed: 0, rejected: 0, failed: 0 };
  const boardItemCount = countBoardItems(input.todayActionBoard);
  const memorySignalCount = (input.memorySuggestions?.length || 0) + (input.relatedMemories?.items?.length || 0);
  const contentPlanCount = (input.contentPerformance?.weeklyPlan?.length || 0)
    + (input.contentPerformance?.recommendations?.length || 0);

  const estimatedTimeSavedMinutes =
    activity.completedRuns * 4
    + activity.monitorRuns * 8
    + boardItemCount * 3
    + approvals.executed * 6
    + approvals.rejected * 4
    + contentPlanCount * 5
    + memorySignalCount * 4;

  const riskSignalsHandled =
    (input.approvalGateSummary?.blockCount || 0)
    + (input.approvalGateSummary?.reviewCount || 0)
    + (input.pendingApprovals?.highRiskCount || 0)
    + (input.pendingApprovals?.staleCount || 0)
    + approvals.rejected
    + approvals.failed
    + (input.latestMonitorSnapshot?.item?.alerts?.length || 0);

  const metrics = [
    {
      id: "time_saved" as const,
      label: "운영 시간 절약",
      value: `${estimatedTimeSavedMinutes}분+`,
      detail: `최근 run ${activity.totalRuns}건, monitor ${activity.monitorRuns}건, action board ${boardItemCount}개 기준 추정`,
      score: clampScore(Math.round(estimatedTimeSavedMinutes / 1.2))
    },
    {
      id: "risk_prevented" as const,
      label: "위험 차단/검토",
      value: `${riskSignalsHandled}건`,
      detail: `gate block/review, high risk/stale approval, alert, 거절/실패 승인 합산`,
      score: clampScore(riskSignalsHandled * 16 + (input.pendingApprovals?.count ? 8 : 0))
    },
    {
      id: "automation_coverage" as const,
      label: "자동화 커버리지",
      value: `${activity.monitorRuns ? "감시 연결" : "감시 준비"} / ${input.capabilityMatrix?.score || 0}`,
      detail: `Capability Matrix ${input.capabilityMatrix?.score || 0}/100, completed run ${activity.completedRuns}건`,
      score: clampScore(Math.round(((input.capabilityMatrix?.score || 0) * 0.7) + Math.min(activity.completedRuns * 5, 30)))
    },
    {
      id: "learning_loop" as const,
      label: "학습 루프",
      value: `${memorySignalCount}개 후보`,
      detail: `관련 memory ${(input.relatedMemories?.items?.length || 0)}개, 저장 제안 ${(input.memorySuggestions?.length || 0)}개`,
      score: clampScore(35 + memorySignalCount * 18)
    },
    {
      id: "content_leverage" as const,
      label: "콘텐츠 레버리지",
      value: `${contentPlanCount}개 아이디어`,
      detail: `게시글 ${input.contentPerformance?.totalPosts || 0}개, 조회 ${input.contentPerformance?.totalViews || 0}회 기반`,
      score: clampScore((input.contentPerformance?.totalPosts || 0) > 0 ? 55 + contentPlanCount * 8 : contentPlanCount * 10)
    }
  ];

  const score = Math.round(metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length);
  const label = getValueLabel(score);
  const wins = buildWins({ estimatedTimeSavedMinutes, riskSignalsHandled, activity, approvals, input });
  const nextLeverage = buildNextLeverage(input, metrics);

  return {
    generatedAt: new Date().toISOString(),
    score,
    label,
    summary: buildSummary(label, estimatedTimeSavedMinutes, riskSignalsHandled, nextLeverage),
    metrics,
    wins,
    nextLeverage
  };
}

function countBoardItems(board?: any) {
  const lanes = board?.lanes || {};
  return ["doNow", "review", "watch", "save"].reduce((sum, key) => sum + (lanes[key]?.length || 0), 0);
}

function buildWins(input: {
  estimatedTimeSavedMinutes: number;
  riskSignalsHandled: number;
  activity: { totalRuns: number; completedRuns: number; failedRuns: number; monitorRuns: number };
  approvals: { executed: number; rejected: number; failed: number };
  input: Parameters<typeof buildOperatorValueScorecard>[0];
}) {
  const wins = [];
  if (input.estimatedTimeSavedMinutes > 0) wins.push(`최근 운영에서 약 ${input.estimatedTimeSavedMinutes}분 이상의 수동 확인을 줄였습니다.`);
  if (input.riskSignalsHandled > 0) wins.push(`승인 gate/alert 기준 위험 신호 ${input.riskSignalsHandled}건을 검토 대상으로 올렸습니다.`);
  if (input.activity.monitorRuns > 0) wins.push(`GitHub Actions 기반 monitor snapshot ${input.activity.monitorRuns}건이 기록되었습니다.`);
  if (input.approvals.executed || input.approvals.rejected) wins.push(`승인 실행 ${input.approvals.executed}건, 거절 ${input.approvals.rejected}건이 감사 로그로 남았습니다.`);
  if ((input.input.contentPerformance?.weeklyPlan?.length || 0) > 0) wins.push("게시글 성과를 주간 콘텐츠 계획으로 연결했습니다.");
  if (!wins.length) wins.push("아직 누적된 운영 성과가 적습니다. 수동 점검과 일일 요약 저장부터 시작하세요.");
  return wins.slice(0, 4);
}

function buildNextLeverage(
  input: Parameters<typeof buildOperatorValueScorecard>[0],
  metrics: AgentOperatorValueScorecard["metrics"]
) {
  const weak = [...metrics].sort((a, b) => a.score - b.score)[0];
  const items = [];

  if (weak.id === "time_saved" || !input.latestMonitorSnapshot?.item) {
    items.push({
      title: "수동 점검 snapshot 남기기",
      reason: "성과 누적의 기준점이 부족합니다.",
      prompt: "지금 수동 운영 점검을 실행하고 결과를 요약해줘"
    });
  }
  if (weak.id === "risk_prevented" || (input.pendingApprovals?.count || 0) > 0) {
    items.push({
      title: "승인 대기 영향 검토",
      reason: "위험 작업은 실행 전 impact와 gate 확인이 가장 큰 가치입니다.",
      prompt: "승인 대기 작업을 impact 기준으로 검토해줘"
    });
  }
  if (weak.id === "learning_loop" || (input.memorySuggestions?.length || 0) > 0) {
    items.push({
      title: "반복 이슈 memory 저장",
      reason: "memory가 쌓일수록 다음 장애 진단 시간이 줄어듭니다.",
      prompt: "Learning Suggestions 중 가장 중요한 항목을 memory 저장 승인 요청으로 만들어줘"
    });
  }
  if (weak.id === "content_leverage") {
    items.push({
      title: "성과 기반 콘텐츠 초안",
      reason: "운영 데이터가 사용자에게 보이는 콘텐츠로 전환되면 사이트 성장에도 기여합니다.",
      prompt: "최근 게시글 성과를 분석하고 다음 콘텐츠를 추천해줘"
    });
  }
  if (!items.length) {
    items.push({
      title: "일일 운영 digest 저장",
      reason: "정상 운영일수록 기록을 남겨 기준선을 만드는 것이 좋습니다.",
      prompt: "오늘 운영 브리핑을 리포트로 저장 요청해줘"
    });
  }
  return items.slice(0, 3);
}

function buildSummary(
  label: AgentOperatorValueScorecard["label"],
  minutes: number,
  risks: number,
  nextLeverage: AgentOperatorValueScorecard["nextLeverage"]
) {
  const next = nextLeverage[0]?.title || "일일 운영 digest 저장";
  if (label === "excellent") return `운영 보조 가치가 높습니다. 약 ${minutes}분 절약, 위험 신호 ${risks}건을 다뤘고 다음 레버리지는 ${next}입니다.`;
  if (label === "useful") return `실제 운영에 도움이 되는 상태입니다. 약 ${minutes}분 절약, 위험 신호 ${risks}건을 기록했습니다.`;
  if (label === "warming_up") return `가치 누적이 시작되었습니다. ${next}부터 실행하면 점수가 빠르게 올라갑니다.`;
  return `아직 가치 증거가 부족합니다. ${next}을 먼저 실행해 운영 기록을 쌓으세요.`;
}

function getValueLabel(score: number): AgentOperatorValueScorecard["label"] {
  if (score >= 85) return "excellent";
  if (score >= 65) return "useful";
  if (score >= 40) return "warming_up";
  return "needs_attention";
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}
