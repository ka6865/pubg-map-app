export type AgentGrowthRoadmapItem = {
  id: string;
  horizon: "now" | "this_week" | "later";
  priority: "low" | "medium" | "high";
  title: string;
  reason: string;
  expectedValue: string;
  prompt: string;
  owner: "admin" | "agent" | "developer";
};

export type AgentGrowthRoadmap = {
  generatedAt: string;
  status: "on_track" | "needs_focus" | "blocked";
  summary: string;
  lanes: {
    now: AgentGrowthRoadmapItem[];
    thisWeek: AgentGrowthRoadmapItem[];
    later: AgentGrowthRoadmapItem[];
  };
  primaryPrompt: string;
};

export function buildAgentGrowthRoadmap(input: {
  severity: "ok" | "warn" | "critical";
  operatingMode?: any;
  dailyCheckout?: any;
  todayActionBoard?: any;
  nextActions?: any[];
  improvementBacklog?: any;
  capabilityMatrix?: any;
  operatorValue?: any;
  approvalGateSummary?: any;
  pendingApprovals?: any;
  memorySuggestions?: any[];
}): AgentGrowthRoadmap {
  const items = dedupeItems([
    ...itemsFromImmediateOperations(input),
    ...itemsFromOperatorValue(input.operatorValue),
    ...itemsFromCapabilities(input.capabilityMatrix),
    ...itemsFromBacklog(input.improvementBacklog),
    ...itemsFromLearning(input.memorySuggestions || [])
  ]).sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority));

  const lanes = {
    now: items.filter((item) => item.horizon === "now").slice(0, 3),
    thisWeek: items.filter((item) => item.horizon === "this_week").slice(0, 4),
    later: items.filter((item) => item.horizon === "later").slice(0, 4)
  };

  if (!lanes.now.length && input.todayActionBoard?.primaryPrompt) {
    lanes.now.push({
      id: "run-primary-board-action",
      horizon: "now",
      priority: input.todayActionBoard.status === "blocked" ? "high" : "medium",
      title: "오늘 첫 액션 실행",
      reason: input.todayActionBoard.summary || "Today Action Board가 다음 액션을 제안했습니다.",
      expectedValue: "오늘 처리해야 할 운영 위험이나 기록 작업을 바로 줄입니다.",
      prompt: input.todayActionBoard.primaryPrompt,
      owner: "agent"
    });
  }

  if (!lanes.thisWeek.length) {
    lanes.thisWeek.push({
      id: "save-weekly-ops-baseline",
      horizon: "this_week",
      priority: "low",
      title: "주간 운영 기준선 저장",
      reason: "큰 장애가 없어도 정상 기준선을 남기면 다음 이상 징후 감지가 쉬워집니다.",
      expectedValue: "향후 운영 리포트와 memory의 비교 기준을 만듭니다.",
      prompt: "이번 주 운영 기준선을 리포트로 저장 요청해줘",
      owner: "agent"
    });
  }

  const status = input.severity === "critical" || lanes.now.some((item) => item.priority === "high")
    ? "blocked"
    : lanes.now.length || lanes.thisWeek.some((item) => item.priority !== "low")
      ? "needs_focus"
      : "on_track";

  const primary = lanes.now[0] || lanes.thisWeek[0] || lanes.later[0];

  return {
    generatedAt: new Date().toISOString(),
    status,
    summary: buildSummary(status, lanes),
    lanes,
    primaryPrompt: primary?.prompt || "오늘 운영 브리핑 해줘"
  };
}

function itemsFromImmediateOperations(input: Parameters<typeof buildAgentGrowthRoadmap>[0]): AgentGrowthRoadmapItem[] {
  const items: AgentGrowthRoadmapItem[] = [];
  if ((input.approvalGateSummary?.blockCount || 0) > 0) {
    items.push({
      id: "fix-blocked-approval-gates",
      horizon: "now",
      priority: "high",
      title: "차단된 승인 요청 정리",
      reason: `Execution Gate block ${input.approvalGateSummary.blockCount}건이 있습니다.`,
      expectedValue: "실수로 위험 작업이 실행되는 것을 막고, 정확한 요청으로 재생성합니다.",
      prompt: "Execution Gate block 승인 요청을 원인과 재생성 기준으로 정리해줘",
      owner: "admin"
    });
  }
  if ((input.pendingApprovals?.highRiskCount || 0) > 0 || (input.pendingApprovals?.staleCount || 0) > 0) {
    items.push({
      id: "review-risky-approval-queue",
      horizon: "now",
      priority: "high",
      title: "고위험/오래된 승인 우선 검토",
      reason: `high risk ${input.pendingApprovals?.highRiskCount || 0}건, stale ${input.pendingApprovals?.staleCount || 0}건`,
      expectedValue: "승인 대기열의 운영 리스크를 줄이고 감사 로그를 남깁니다.",
      prompt: "오래된 승인과 고위험 승인 요청을 먼저 처리할 순서로 정리해줘",
      owner: "admin"
    });
  }
  if (input.operatingMode?.primaryAction?.prompt) {
    items.push({
      id: "run-operating-mode-primary-action",
      horizon: input.severity === "ok" ? "this_week" : "now",
      priority: input.severity === "critical" ? "high" : input.severity === "warn" ? "medium" : "low",
      title: input.operatingMode.primaryAction.label || "운영 모드 권장 액션",
      reason: input.operatingMode.summary || "운영 모드가 primary action을 제안했습니다.",
      expectedValue: "현재 운영 모드에 맞는 첫 조치를 실행합니다.",
      prompt: input.operatingMode.primaryAction.prompt,
      owner: "agent"
    });
  }
  return items;
}

function itemsFromOperatorValue(scorecard?: any): AgentGrowthRoadmapItem[] {
  if (!scorecard) return [];
  return (scorecard.nextLeverage || []).slice(0, 3).map((item: any, index: number) => ({
    id: `operator-value-${slugify(item.title || index)}`,
    horizon: index === 0 && scorecard.label !== "excellent" ? "now" as const : "this_week" as const,
    priority: scorecard.score < 40 && index === 0 ? "high" as const : index === 0 ? "medium" as const : "low" as const,
    title: item.title || "운영 가치 레버리지 실행",
    reason: item.reason || "Operator Value Scorecard가 다음 가치 상승 액션으로 제안했습니다.",
    expectedValue: "에이전트가 제공하는 실제 운영 가치를 더 많이 누적합니다.",
    prompt: item.prompt || "Admin Agent가 최근 나에게 얼마나 도움이 됐는지 요약해줘",
    owner: "agent" as const
  }));
}

function itemsFromCapabilities(matrix?: any): AgentGrowthRoadmapItem[] {
  if (!matrix?.items?.length) return [];
  return matrix.items
    .filter((item: any) => item.status !== "ready")
    .slice(0, 3)
    .map((item: any) => ({
      id: `capability-${item.id}`,
      horizon: item.status === "blocked" ? "now" as const : "this_week" as const,
      priority: item.status === "blocked" ? "high" as const : "medium" as const,
      title: `${item.label} 보강`,
      reason: `Capability ${item.score}/100 (${item.status})`,
      expectedValue: "에이전트가 맡을 수 있는 운영 범위를 넓힙니다.",
      prompt: item.nextStep || "Admin Agent 준비 상태를 점검해줘",
      owner: item.id === "security" || item.id === "free_plan" ? "developer" as const : "agent" as const
    }));
}

function itemsFromBacklog(backlog?: any): AgentGrowthRoadmapItem[] {
  if (!backlog?.items?.length) return [];
  return backlog.items.slice(0, 4).map((item: any) => ({
    id: `backlog-${item.id}`,
    horizon: item.priority === "high" ? "now" as const : item.priority === "medium" ? "this_week" as const : "later" as const,
    priority: item.priority || "low",
    title: item.title,
    reason: item.reason,
    expectedValue: item.action,
    prompt: promptForBacklogItem(item),
    owner: item.owner || "agent"
  }));
}

function itemsFromLearning(suggestions: any[]): AgentGrowthRoadmapItem[] {
  return suggestions.slice(0, 2).map((suggestion) => ({
    id: `learning-${suggestion.id}`,
    horizon: suggestion.priority === "high" ? "now" as const : "this_week" as const,
    priority: suggestion.priority || "medium",
    title: suggestion.title,
    reason: suggestion.reason,
    expectedValue: "반복 이슈를 다음 진단에서 바로 재사용할 수 있게 만듭니다.",
    prompt: suggestion.prompt,
    owner: "agent" as const
  }));
}

function promptForBacklogItem(item: any) {
  if (item.id?.includes("approval")) return "승인 대기 작업을 impact 기준으로 검토해줘";
  if (item.id?.includes("deployment")) return "최근 Vercel 배포 실패 원인을 분석해줘";
  if (item.id?.includes("content")) return "최근 게시글 성과를 분석하고 다음 콘텐츠를 추천해줘";
  if (item.id?.includes("memory")) return "이번 대응 내용을 memory로 저장해줘";
  if (item.id?.includes("cost")) return "최근 AI 비용과 사용량을 분석해줘";
  if (item.id?.includes("pubg") || item.id?.includes("api")) return "최근 PUBG API 에러 원인을 분석해줘";
  return item.action || "Admin Agent 준비 상태를 점검해줘";
}

function dedupeItems(items: AgentGrowthRoadmapItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.horizon}:${item.title}:${item.prompt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSummary(status: AgentGrowthRoadmap["status"], lanes: AgentGrowthRoadmap["lanes"]) {
  const now = lanes.now.length;
  const week = lanes.thisWeek.length;
  if (status === "blocked") return `지금 처리할 고우선순위 액션 ${now}개가 있습니다. 첫 항목부터 실행하세요.`;
  if (status === "needs_focus") return `오늘 ${now}개, 이번 주 ${week}개 액션으로 에이전트 가치를 더 끌어올릴 수 있습니다.`;
  return `핵심 운영은 안정권입니다. 이번 주 개선 항목 ${week}개를 유지 보수 리듬으로 처리하세요.`;
}

function priorityWeight(priority: AgentGrowthRoadmapItem["priority"]) {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function slugify(value: string) {
  return String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "item";
}
