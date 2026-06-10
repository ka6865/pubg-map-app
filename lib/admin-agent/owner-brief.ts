export type AgentOwnerBrief = {
  generatedAt: string;
  status: "calm" | "watch" | "act_now";
  headline: string;
  summary: string;
  doNow: {
    title: string;
    reason: string;
    prompt: string;
  };
  delegateToAgent: Array<{
    title: string;
    reason: string;
    prompt: string;
  }>;
  needsOwnerReview: Array<{
    title: string;
    reason: string;
    location: string;
  }>;
  confidence: number;
};

export function buildAgentOwnerBrief(input: {
  severity: "ok" | "warn" | "critical";
  operatingMode?: any;
  dailyCheckout?: any;
  todayActionBoard?: any;
  growthRoadmap?: any;
  operatorValue?: any;
  capabilityMatrix?: any;
  pendingApprovals?: any;
  approvalGateSummary?: any;
  latestMonitorSnapshot?: any;
  contentPerformance?: any;
}): AgentOwnerBrief {
  const gateBlock = Number(input.approvalGateSummary?.blockCount || 0);
  const pending = Number(input.pendingApprovals?.count || 0);
  const stale = Number(input.pendingApprovals?.staleCount || 0);
  const highRisk = Number(input.pendingApprovals?.highRiskCount || 0);
  const alertCount = Array.isArray(input.latestMonitorSnapshot?.item?.alerts)
    ? input.latestMonitorSnapshot.item.alerts.length
    : 0;

  const status: AgentOwnerBrief["status"] = input.severity === "critical" || gateBlock > 0 || stale > 0
    ? "act_now"
    : input.severity === "warn" || pending > 0 || alertCount > 0
      ? "watch"
      : "calm";
  const doNow = pickDoNow(input, status);
  const delegateToAgent = buildDelegations(input);
  const needsOwnerReview = buildOwnerReviews({ gateBlock, pending, stale, highRisk, input });
  const confidence = calculateConfidence(input);

  return {
    generatedAt: new Date().toISOString(),
    status,
    headline: buildHeadline(status, input, { gateBlock, pending, alertCount }),
    summary: buildSummary(status, input, { gateBlock, pending, stale, highRisk, alertCount }),
    doNow,
    delegateToAgent,
    needsOwnerReview,
    confidence
  };
}

function pickDoNow(input: Parameters<typeof buildAgentOwnerBrief>[0], status: AgentOwnerBrief["status"]) {
  const roadmapPrompt = input.growthRoadmap?.primaryPrompt;
  const boardPrompt = input.todayActionBoard?.primaryPrompt;
  const modePrompt = input.operatingMode?.primaryAction?.prompt;
  if (status === "act_now") {
    return {
      title: input.growthRoadmap?.lanes?.now?.[0]?.title || input.operatingMode?.primaryAction?.label || "위험 신호 먼저 처리",
      reason: input.growthRoadmap?.lanes?.now?.[0]?.reason || input.dailyCheckout?.summary || "즉시 확인해야 할 운영 신호가 있습니다.",
      prompt: roadmapPrompt || boardPrompt || modePrompt || "승인 대기 작업을 impact 기준으로 검토해줘"
    };
  }
  if (status === "watch") {
    return {
      title: input.growthRoadmap?.lanes?.now?.[0]?.title || "주의 신호 점검",
      reason: input.operatingMode?.summary || "운영 신호가 완전한 정상은 아니므로 짧게 점검하는 편이 좋습니다.",
      prompt: roadmapPrompt || modePrompt || boardPrompt || "오늘 운영 브리핑 해줘"
    };
  }
  return {
    title: "정상 운영 기록 남기기",
    reason: "큰 위험 신호가 없을 때 기준선을 남기면 다음 이상 징후를 더 빨리 봅니다.",
    prompt: roadmapPrompt || "오늘 운영 브리핑을 리포트로 저장 요청해줘"
  };
}

function buildDelegations(input: Parameters<typeof buildAgentOwnerBrief>[0]) {
  const items = [
    input.operatorValue?.nextLeverage?.[0] && {
      title: input.operatorValue.nextLeverage[0].title,
      reason: input.operatorValue.nextLeverage[0].reason,
      prompt: input.operatorValue.nextLeverage[0].prompt
    },
    input.growthRoadmap?.lanes?.thisWeek?.[0] && {
      title: input.growthRoadmap.lanes.thisWeek[0].title,
      reason: input.growthRoadmap.lanes.thisWeek[0].expectedValue,
      prompt: input.growthRoadmap.lanes.thisWeek[0].prompt
    },
    (input.contentPerformance?.recommendations?.[0] || input.contentPerformance?.weeklyPlan?.[0]) && {
      title: "성과 기반 콘텐츠 아이디어 만들기",
      reason: input.contentPerformance?.recommendations?.[0] || input.contentPerformance?.weeklyPlan?.[0]?.angle || "운영 데이터를 콘텐츠로 전환할 수 있습니다.",
      prompt: "최근 게시글 성과를 분석하고 다음 콘텐츠를 추천해줘"
    }
  ].filter(Boolean);

  const deduped = new Map<string, any>();
  items.forEach((item: any) => deduped.set(item.prompt, item));
  return Array.from(deduped.values()).slice(0, 3);
}

function buildOwnerReviews(input: {
  gateBlock: number;
  pending: number;
  stale: number;
  highRisk: number;
  input: Parameters<typeof buildAgentOwnerBrief>[0];
}) {
  const reviews = [];
  if (input.gateBlock > 0) {
    reviews.push({
      title: "Execution Gate block",
      reason: `${input.gateBlock}건은 승인하면 안 되는 요청일 수 있습니다.`,
      location: "/admin/bot 승인 패널"
    });
  }
  if (input.highRisk > 0 || input.stale > 0) {
    reviews.push({
      title: "고위험/오래된 승인",
      reason: `high risk ${input.highRisk}건, stale ${input.stale}건`,
      location: "/admin/bot 승인 패널"
    });
  }
  const blockedCapability = input.input.capabilityMatrix?.items?.find((item: any) => item.status === "blocked");
  if (blockedCapability) {
    reviews.push({
      title: `${blockedCapability.label} 능력 차단`,
      reason: blockedCapability.nextStep,
      location: "/admin/bot Capability Matrix"
    });
  }
  if (!reviews.length && input.pending > 0) {
    reviews.push({
      title: "승인 대기 확인",
      reason: `${input.pending}건이 대기 중입니다. 영향 preview만 확인하면 됩니다.`,
      location: "/admin/bot 승인 패널"
    });
  }
  return reviews.slice(0, 3);
}

function buildHeadline(status: AgentOwnerBrief["status"], input: Parameters<typeof buildAgentOwnerBrief>[0], counts: { gateBlock: number; pending: number; alertCount: number }) {
  if (status === "act_now") return `지금 확인할 운영 이슈가 있습니다: gate block ${counts.gateBlock}건, 승인 대기 ${counts.pending}건.`;
  if (status === "watch") return `운영은 유지 중이지만 주의 신호 ${counts.alertCount + counts.pending}건을 짧게 확인하세요.`;
  return `운영은 안정권입니다. ${input.operatorValue?.score ?? 0}/100 가치 점수를 계속 누적하면 됩니다.`;
}

function buildSummary(status: AgentOwnerBrief["status"], input: Parameters<typeof buildAgentOwnerBrief>[0], counts: { gateBlock: number; pending: number; stale: number; highRisk: number; alertCount: number }) {
  const checkout = input.dailyCheckout?.label || input.dailyCheckout?.status || "unknown";
  const capability = input.capabilityMatrix?.score ?? 0;
  const value = input.operatorValue?.score ?? 0;
  if (status === "act_now") {
    return `마감 상태 ${checkout}. 승인 gate와 오래된 요청을 먼저 정리하면 위험을 크게 줄일 수 있습니다. Capability ${capability}/100, Value ${value}/100.`;
  }
  if (status === "watch") {
    return `마감 상태 ${checkout}. 위험은 제한적이지만 승인 ${counts.pending}건과 alert ${counts.alertCount}건을 보고 다음 액션을 고르면 됩니다.`;
  }
  return `마감 상태 ${checkout}. 지금은 리포트 저장, memory seed, 콘텐츠 초안처럼 성장 루틴을 돌리기 좋은 타이밍입니다.`;
}

function calculateConfidence(input: Parameters<typeof buildAgentOwnerBrief>[0]) {
  const signals = [
    Boolean(input.dailyCheckout),
    Boolean(input.todayActionBoard),
    Boolean(input.growthRoadmap),
    Boolean(input.operatorValue),
    Boolean(input.capabilityMatrix),
    Boolean(input.latestMonitorSnapshot?.item)
  ];
  return Math.round((signals.filter(Boolean).length / signals.length) * 100);
}
