export type AgentOperatorCoachItem = {
  id: string;
  priority: "low" | "medium" | "high";
  title: string;
  reason: string;
  prompt: string;
  expectedValue: string;
  source: string;
};

export type AgentOperatorCoach = {
  generatedAt: string;
  mode: "recover" | "focus" | "grow";
  summary: string;
  topPrompt: string;
  items: AgentOperatorCoachItem[];
};

export function buildAgentOperatorCoach(input: {
  severity?: "ok" | "warn" | "critical";
  outcomeReview?: any;
  ownerInbox?: any;
  missionControl?: any;
  dailyCheckout?: any;
  growthRoadmap?: any;
  operatorValue?: any;
  capabilityMatrix?: any;
  contentPerformance?: any;
}): AgentOperatorCoach {
  const items = dedupeItems([
    ...fromOutcome(input.outcomeReview),
    ...fromOwnerInbox(input.ownerInbox),
    ...fromMission(input.missionControl),
    ...fromCheckout(input.dailyCheckout),
    ...fromGrowth(input.growthRoadmap),
    ...fromValue(input.operatorValue),
    ...fromCapability(input.capabilityMatrix),
    ...fromContent(input.contentPerformance)
  ]).sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority));
  const mode: AgentOperatorCoach["mode"] = input.severity === "critical" || input.outcomeReview?.status === "follow_up"
    ? "recover"
    : input.severity === "warn" || input.ownerInbox?.status === "attention" || input.missionControl?.status === "urgent"
      ? "focus"
      : "grow";
  const top = items[0];

  return {
    generatedAt: new Date().toISOString(),
    mode,
    summary: buildSummary(mode, items),
    topPrompt: top?.prompt || "30초 운영자 브리핑으로 지금 할 일만 알려줘",
    items: items.slice(0, 7)
  };
}

function fromOutcome(review?: any): AgentOperatorCoachItem[] {
  if (!review) return [];
  const top = review.items?.[0];
  return [{
    id: "coach-outcome",
    priority: review.status === "follow_up" ? "high" : review.status === "watch" ? "medium" : "low",
    title: review.status === "closed" ? "운영 루프 기준선 저장" : "남은 후속 조치 확인",
    reason: review.summary || top?.evidence || "최근 조치 결과를 확인합니다.",
    prompt: review.primaryPrompt || top?.prompt,
    expectedValue: review.status === "closed" ? "정상 상태를 기준선으로 남깁니다." : "미완료 항목을 줄이고 다음 확인 기준을 정합니다.",
    source: "outcome_review"
  }];
}

function fromOwnerInbox(inbox?: any): AgentOperatorCoachItem[] {
  if (!inbox) return [];
  return [{
    id: "coach-owner-inbox",
    priority: inbox.status === "attention" ? "high" : inbox.status === "review" ? "medium" : "low",
    title: "내가 볼 것과 위임할 것 분리",
    reason: inbox.summary,
    prompt: inbox.primaryAction,
    expectedValue: "운영자의 직접 판단 시간을 줄입니다.",
    source: "owner_inbox"
  }];
}

function fromMission(mission?: any): AgentOperatorCoachItem[] {
  if (!mission) return [];
  return [{
    id: "coach-mission",
    priority: mission.status === "urgent" ? "high" : mission.status === "focus" ? "medium" : "low",
    title: "현재 실행 순서 확정",
    reason: mission.summary,
    prompt: mission.firstCommand,
    expectedValue: "다음 명령부터 바로 실행할 수 있게 만듭니다.",
    source: "mission_control"
  }];
}

function fromCheckout(checkout?: any): AgentOperatorCoachItem[] {
  if (!checkout) return [];
  return [{
    id: "coach-checkout",
    priority: checkout.status === "blocked" ? "high" : checkout.status === "attention" ? "medium" : "low",
    title: "운영 마감 상태 확인",
    reason: checkout.summary,
    prompt: checkout.handoffPrompt || "오늘 운영 마감 가능한지 남은 위험과 내일 포커스를 점검해줘",
    expectedValue: "오늘 마감 전 남은 위험을 분리합니다.",
    source: "daily_checkout"
  }];
}

function fromGrowth(roadmap?: any): AgentOperatorCoachItem[] {
  const item = roadmap?.lanes?.now?.[0] || roadmap?.lanes?.thisWeek?.[0];
  if (!item) return [];
  return [{
    id: "coach-growth",
    priority: item.priority || "medium",
    title: item.title,
    reason: item.reason || roadmap.summary,
    prompt: item.prompt || roadmap.primaryPrompt,
    expectedValue: item.expectedValue || "다음 개선 액션을 진행합니다.",
    source: "growth_roadmap"
  }];
}

function fromValue(scorecard?: any): AgentOperatorCoachItem[] {
  const item = scorecard?.nextLeverage?.[0];
  if (!item) return [];
  return [{
    id: "coach-value",
    priority: scorecard.score < 40 ? "high" : scorecard.score < 65 ? "medium" : "low",
    title: item.title,
    reason: item.reason,
    prompt: item.prompt,
    expectedValue: "에이전트가 실제로 절약하는 시간과 위험 감소를 키웁니다.",
    source: "operator_value"
  }];
}

function fromCapability(matrix?: any): AgentOperatorCoachItem[] {
  const item = matrix?.items?.find((entry: any) => entry.status !== "ready");
  if (!item) return [];
  return [{
    id: "coach-capability",
    priority: item.status === "blocked" ? "high" : "medium",
    title: `${item.label} 보강`,
    reason: `Capability ${item.score}/100 (${item.status})`,
    prompt: item.nextStep,
    expectedValue: "에이전트의 맡길 수 있는 범위를 넓힙니다.",
    source: "capability_matrix"
  }];
}

function fromContent(performance?: any): AgentOperatorCoachItem[] {
  const reason = performance?.recommendations?.[0] || performance?.weeklyPlan?.[0]?.angle;
  if (!reason) return [];
  return [{
    id: "coach-content",
    priority: "low",
    title: "운영 데이터를 콘텐츠로 전환",
    reason,
    prompt: "최근 게시글 성과를 분석하고 다음 콘텐츠를 추천해줘",
    expectedValue: "운영 데이터가 사이트 성장 액션으로 이어집니다.",
    source: "content_performance"
  }];
}

function dedupeItems(items: AgentOperatorCoachItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.prompt || seen.has(item.prompt)) return false;
    seen.add(item.prompt);
    return true;
  });
}

function buildSummary(mode: AgentOperatorCoach["mode"], items: AgentOperatorCoachItem[]) {
  if (mode === "recover") return `복구 모드입니다. ${items.length}개 추천 중 후속 조치부터 실행하세요.`;
  if (mode === "focus") return `집중 모드입니다. ${items.length}개 추천 중 운영자 판단과 위임을 먼저 나누세요.`;
  return `성장 모드입니다. ${items.length}개 추천 중 기록, 개선, 콘텐츠 전환을 진행하세요.`;
}

function priorityRank(priority: AgentOperatorCoachItem["priority"]) {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}
