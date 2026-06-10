export type AgentOutcomeReviewItem = {
  id: string;
  status: "improved" | "watch" | "unresolved";
  priority: "low" | "medium" | "high";
  title: string;
  evidence: string;
  nextCheck: string;
  prompt: string;
};

export type AgentOutcomeReview = {
  generatedAt: string;
  status: "closed" | "watch" | "follow_up";
  score: number;
  summary: string;
  items: AgentOutcomeReviewItem[];
  primaryPrompt: string;
};

export function buildAgentOutcomeReview(input: {
  recentAgentActivity?: {
    totalRuns?: number;
    completedRuns?: number;
    failedRuns?: number;
    monitorRuns?: number;
  };
  approvalOutcomes?: {
    executed?: number;
    rejected?: number;
    failed?: number;
  };
  pendingApprovals?: {
    count?: number;
    highRiskCount?: number;
    staleCount?: number;
  };
  approvalGateSummary?: {
    blockCount?: number;
    reviewCount?: number;
  };
  failedRuns?: { count?: number };
  apiErrors?: { total?: number };
  aiUsage?: { totalRequests?: number; totalCostUsd?: number };
  latestMonitorSnapshot?: any;
  monitorTrend?: any;
  dailyCheckout?: any;
  missionControl?: any;
  ownerInbox?: any;
}): AgentOutcomeReview {
  const items = [
    ...buildRunItems(input),
    ...buildApprovalItems(input),
    ...buildIncidentItems(input),
    ...buildMonitorItems(input),
    ...buildWorkflowItems(input)
  ].sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || statusRank(b.status) - statusRank(a.status));
  const unresolved = items.filter((item) => item.status === "unresolved").length;
  const watch = items.filter((item) => item.status === "watch").length;
  const improved = items.filter((item) => item.status === "improved").length;
  const score = calculateScore({ unresolved, watch, improved, input });
  const status: AgentOutcomeReview["status"] = unresolved > 0 ? "follow_up" : watch > 0 ? "watch" : "closed";
  const primary = items.find((item) => item.status === "unresolved")
    || items.find((item) => item.status === "watch")
    || items[0];

  return {
    generatedAt: new Date().toISOString(),
    status,
    score,
    summary: buildSummary(status, score, { unresolved, watch, improved }),
    items,
    primaryPrompt: primary?.prompt || "오늘 운영 마감 가능한지 남은 위험과 내일 포커스를 점검해줘"
  };
}

function buildRunItems(input: Parameters<typeof buildAgentOutcomeReview>[0]): AgentOutcomeReviewItem[] {
  const failed = Number(input.failedRuns?.count || input.recentAgentActivity?.failedRuns || 0);
  const completed = Number(input.recentAgentActivity?.completedRuns || 0);
  if (failed > 0) {
    return [{
      id: "outcome-agent-runs-failed",
      status: "unresolved",
      priority: "high",
      title: "실패한 agent run 후속 확인",
      evidence: `최근 실패 run ${failed}건, 완료 run ${completed}건`,
      nextCheck: "실패 run timeline에서 tool/error/result를 확인합니다.",
      prompt: "최근 실패한 agent run의 timeline과 원인을 요약해줘"
    }];
  }
  if (completed > 0) {
    return [{
      id: "outcome-agent-runs-healthy",
      status: "improved",
      priority: "low",
      title: "agent run 정상 처리",
      evidence: `최근 완료 run ${completed}건, 실패 0건`,
      nextCheck: "다음 monitor snapshot에서도 실패 run이 없는지 확인합니다.",
      prompt: "최근 monitor 추세가 좋아지는지 나빠지는지 알려줘"
    }];
  }
  return [{
    id: "outcome-agent-runs-empty",
    status: "watch",
    priority: "medium",
    title: "최근 실행 증거 부족",
    evidence: "최근 agent run 활동이 거의 없습니다.",
    nextCheck: "수동 점검 snapshot이나 운영 브리핑을 실행해 기준선을 남깁니다.",
    prompt: "지금 수동 운영 점검을 실행하고 결과를 요약해줘"
  }];
}

function buildApprovalItems(input: Parameters<typeof buildAgentOutcomeReview>[0]): AgentOutcomeReviewItem[] {
  const pending = Number(input.pendingApprovals?.count || 0);
  const high = Number(input.pendingApprovals?.highRiskCount || 0);
  const stale = Number(input.pendingApprovals?.staleCount || 0);
  const gateBlock = Number(input.approvalGateSummary?.blockCount || 0);
  const executed = Number(input.approvalOutcomes?.executed || 0);
  const rejected = Number(input.approvalOutcomes?.rejected || 0);
  const failed = Number(input.approvalOutcomes?.failed || 0);
  if (gateBlock > 0 || failed > 0) {
    return [{
      id: "outcome-approval-blocked",
      status: "unresolved",
      priority: "high",
      title: "승인 후속 조치 미완료",
      evidence: `gate block ${gateBlock}건, failed approval ${failed}건`,
      nextCheck: "승인하지 말아야 할 요청과 재생성할 요청을 분리합니다.",
      prompt: "승인 대기 요청을 승인/거절/보류 권고로 나눠줘"
    }];
  }
  if (pending > 0 || high > 0 || stale > 0) {
    return [{
      id: "outcome-approval-pending",
      status: "watch",
      priority: high || stale ? "high" : "medium",
      title: "승인 대기열 후속 검토 필요",
      evidence: `pending ${pending}건, high ${high}건, stale ${stale}건, executed ${executed}건, rejected ${rejected}건`,
      nextCheck: "impact/gate 기준으로 승인, 거절, 보류를 나눕니다.",
      prompt: "Owner Inbox로 내가 직접 볼 것과 위임할 것을 나눠줘"
    }];
  }
  return [{
    id: "outcome-approval-clear",
    status: executed || rejected ? "improved" : "watch",
    priority: "low",
    title: "승인 대기열 정리 상태",
    evidence: `pending 0건, executed ${executed}건, rejected ${rejected}건`,
    nextCheck: "다음 위험 작업도 approval flow를 유지합니다.",
    prompt: "Admin Agent 안전 감사 결과와 위험 승인 가능 여부를 점검해줘"
  }];
}

function buildIncidentItems(input: Parameters<typeof buildAgentOutcomeReview>[0]): AgentOutcomeReviewItem[] {
  const apiErrors = Number(input.apiErrors?.total || 0);
  const aiCost = Number(input.aiUsage?.totalCostUsd || 0);
  if (apiErrors > 0) {
    return [{
      id: "outcome-api-errors",
      status: "unresolved",
      priority: "high",
      title: "PUBG API 에러 잔여",
      evidence: `최근 API 에러 ${apiErrors}건`,
      nextCheck: "route/status/message별로 원인을 나눕니다.",
      prompt: "최근 PUBG API 에러 원인을 분석해줘"
    }];
  }
  if (aiCost > 0) {
    return [{
      id: "outcome-ai-usage-watch",
      status: "watch",
      priority: "medium",
      title: "AI 사용량 추적",
      evidence: `최근 AI 비용 $${aiCost.toFixed(6)}`,
      nextCheck: "비용이 임계치에 가까운지 확인합니다.",
      prompt: "최근 AI 비용과 사용량을 분석해줘"
    }];
  }
  return [{
    id: "outcome-incidents-clear",
    status: "improved",
    priority: "low",
    title: "주요 incident 신호 없음",
    evidence: "최근 API 에러와 비용 경고가 없습니다.",
    nextCheck: "다음 monitor snapshot에서 동일 상태인지 확인합니다.",
    prompt: "오늘 운영 브리핑을 리포트로 저장 요청해줘"
  }];
}

function buildMonitorItems(input: Parameters<typeof buildAgentOutcomeReview>[0]): AgentOutcomeReviewItem[] {
  const monitor = input.latestMonitorSnapshot?.item || {};
  const checkout = input.dailyCheckout || monitor.dailyCheckout;
  const trend = input.monitorTrend;
  if (monitor.severity === "critical" || checkout?.status === "blocked") {
    return [{
      id: "outcome-monitor-critical",
      status: "unresolved",
      priority: "high",
      title: "monitor 마감 차단",
      evidence: `monitor ${monitor.severity || "unknown"}, checkout ${checkout?.status || "unknown"}`,
      nextCheck: "Mission Control 첫 명령부터 다시 실행합니다.",
      prompt: "Mission Control로 지금 실행 순서를 정리해줘"
    }];
  }
  if (monitor.severity === "warn" || trend?.direction === "worsening") {
    return [{
      id: "outcome-monitor-watch",
      status: "watch",
      priority: "medium",
      title: "monitor 주의 상태",
      evidence: `monitor ${monitor.severity || "unknown"}, trend ${trend?.label || trend?.direction || "unknown"}`,
      nextCheck: "다음 snapshot에서 severity와 alert 수가 줄었는지 봅니다.",
      prompt: "최근 monitor 추세가 좋아지는지 나빠지는지 알려줘"
    }];
  }
  return [{
    id: "outcome-monitor-clear",
    status: "improved",
    priority: "low",
    title: "monitor 안정 상태",
    evidence: `monitor ${monitor.severity || "ok"}, checkout ${checkout?.status || "clear"}`,
    nextCheck: "정상 기준선을 report memory로 남깁니다.",
    prompt: "오늘 운영 브리핑을 리포트로 저장 요청해줘"
  }];
}

function buildWorkflowItems(input: Parameters<typeof buildAgentOutcomeReview>[0]): AgentOutcomeReviewItem[] {
  const ownerAttention = Number(input.ownerInbox?.counts?.decide || 0) + Number(input.ownerInbox?.counts?.approve || 0);
  const missionUrgent = input.missionControl?.status === "urgent";
  if (missionUrgent || ownerAttention > 0) {
    return [{
      id: "outcome-workflow-open",
      status: "watch",
      priority: missionUrgent ? "high" : "medium",
      title: "운영 workflow 남은 항목",
      evidence: `mission ${input.missionControl?.status || "unknown"}, owner attention ${ownerAttention}개`,
      nextCheck: "Owner Inbox에서 직접 판단할 항목을 줄입니다.",
      prompt: "Owner Inbox로 내가 직접 볼 것과 위임할 것을 나눠줘"
    }];
  }
  return [{
    id: "outcome-workflow-closed",
    status: "improved",
    priority: "low",
    title: "운영 workflow 정리됨",
    evidence: "직접 판단/승인 lane이 비어 있거나 낮은 우선순위입니다.",
    nextCheck: "성과와 개선점을 digest로 남깁니다.",
    prompt: "Admin Agent가 최근 나에게 얼마나 도움이 됐는지 요약해줘"
  }];
}

function calculateScore(input: { unresolved: number; watch: number; improved: number; input: Parameters<typeof buildAgentOutcomeReview>[0] }) {
  const base = 100 - input.unresolved * 28 - input.watch * 10 + Math.min(input.improved * 4, 12);
  return Math.max(0, Math.min(100, base));
}

function buildSummary(status: AgentOutcomeReview["status"], score: number, counts: { unresolved: number; watch: number; improved: number }) {
  if (status === "follow_up") return `후속 조치가 필요합니다. unresolved ${counts.unresolved}개, watch ${counts.watch}개, score ${score}/100.`;
  if (status === "watch") return `대체로 안정적이지만 추적할 항목이 있습니다. watch ${counts.watch}개, score ${score}/100.`;
  return `운영 루프가 닫힌 상태입니다. improved ${counts.improved}개, score ${score}/100.`;
}

function priorityRank(priority: AgentOutcomeReviewItem["priority"]) {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function statusRank(status: AgentOutcomeReviewItem["status"]) {
  if (status === "unresolved") return 3;
  if (status === "watch") return 2;
  return 1;
}
