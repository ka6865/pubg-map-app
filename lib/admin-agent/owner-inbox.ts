export type AgentOwnerInboxLane = "decide" | "approve" | "delegate" | "watch";

export type AgentOwnerInboxItem = {
  id: string;
  lane: AgentOwnerInboxLane;
  priority: "low" | "medium" | "high";
  title: string;
  reason: string;
  action: string;
  location: string;
  owner: "admin" | "agent" | "system";
  source: string;
};

export type AgentOwnerInbox = {
  generatedAt: string;
  status: "empty" | "review" | "attention";
  summary: string;
  primaryAction: string;
  lanes: Record<AgentOwnerInboxLane, AgentOwnerInboxItem[]>;
  counts: Record<AgentOwnerInboxLane, number>;
};

export function buildAgentOwnerInbox(input: {
  ownerBrief?: any;
  missionControl?: any;
  approvalAdvisor?: any;
  safetyAudit?: any;
  riskRadar?: any;
  operatingSop?: any;
  growthRoadmap?: any;
  operatorValue?: any;
  pendingApprovals?: any;
}): AgentOwnerInbox {
  const allItems = dedupeItems([
    ...fromOwnerBrief(input.ownerBrief),
    ...fromMissionControl(input.missionControl),
    ...fromApprovalAdvisor(input.approvalAdvisor),
    ...fromSafetyAudit(input.safetyAudit),
    ...fromRiskRadar(input.riskRadar),
    ...fromDelegations(input),
    ...fromPendingApprovals(input.pendingApprovals)
  ]).sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || laneRank(a.lane) - laneRank(b.lane));
  const lanes = {
    decide: allItems.filter((item) => item.lane === "decide").slice(0, 4),
    approve: allItems.filter((item) => item.lane === "approve").slice(0, 4),
    delegate: allItems.filter((item) => item.lane === "delegate").slice(0, 4),
    watch: allItems.filter((item) => item.lane === "watch").slice(0, 4)
  };
  const counts = {
    decide: lanes.decide.length,
    approve: lanes.approve.length,
    delegate: lanes.delegate.length,
    watch: lanes.watch.length
  };
  const status = counts.decide > 0 || counts.approve > 0
    ? "attention"
    : counts.delegate > 0 || counts.watch > 0
      ? "review"
      : "empty";
  const primary = lanes.decide[0] || lanes.approve[0] || lanes.delegate[0] || lanes.watch[0];

  return {
    generatedAt: new Date().toISOString(),
    status,
    summary: buildSummary(status, counts),
    primaryAction: primary?.action || "30초 운영자 브리핑으로 지금 할 일만 알려줘",
    lanes,
    counts
  };
}

function fromOwnerBrief(brief?: any): AgentOwnerInboxItem[] {
  if (!brief) return [];
  return [
    ...(brief.needsOwnerReview || []).map((item: any, index: number) => ({
      id: `owner-review-${index}`,
      lane: "decide" as const,
      priority: brief.status === "act_now" ? "high" as const : "medium" as const,
      title: item.title,
      reason: item.reason,
      action: brief.doNow?.prompt || "30초 운영자 브리핑으로 지금 할 일만 알려줘",
      location: item.location || "/admin/bot",
      owner: "admin" as const,
      source: "owner_brief"
    })),
    ...(brief.delegateToAgent || []).map((item: any, index: number) => ({
      id: `owner-delegate-${index}`,
      lane: "delegate" as const,
      priority: "medium" as const,
      title: item.title,
      reason: item.reason,
      action: item.prompt,
      location: "/admin/bot",
      owner: "agent" as const,
      source: "owner_brief"
    }))
  ];
}

function fromMissionControl(mission?: any): AgentOwnerInboxItem[] {
  if (!mission?.items?.length) return [];
  return mission.items.slice(0, 4).map((item: any) => ({
    id: `mission-${item.id}`,
    lane: item.owner === "admin" ? "decide" as const : item.phase === "record" ? "watch" as const : "delegate" as const,
    priority: item.priority,
    title: item.title,
    reason: item.reason,
    action: item.command,
    location: item.owner === "admin" ? "/admin/bot" : "/admin/bot 채팅",
    owner: item.owner === "admin" ? "admin" as const : "agent" as const,
    source: "mission_control"
  }));
}

function fromApprovalAdvisor(advisor?: any): AgentOwnerInboxItem[] {
  if (!advisor?.items?.length) return [];
  return advisor.items.slice(0, 4).map((item: any) => ({
    id: `approval-${item.id}`,
    lane: "approve" as const,
    priority: item.decision === "reject" || item.priority === "high" ? "high" as const : item.decision === "defer" ? "medium" as const : "low" as const,
    title: `${decisionLabel(item.decision)}: ${item.title}`,
    reason: item.reason,
    action: item.prompt,
    location: `/admin/bot 승인 패널`,
    owner: "admin" as const,
    source: "approval_advisor"
  }));
}

function fromSafetyAudit(audit?: any): AgentOwnerInboxItem[] {
  if (!audit || audit.status === "pass") return [];
  const issue = audit.invariants?.find((item: any) => item.status !== "ok");
  return [{
    id: "safety-audit-review",
    lane: audit.status === "block" ? "decide" : "watch",
    priority: audit.status === "block" ? "high" : "medium",
    title: issue?.label || "Agent Safety Audit 확인",
    reason: issue?.risk || audit.summary,
    action: audit.primaryPrompt,
    location: "/admin/bot Safety Audit",
    owner: "admin",
    source: "safety_audit"
  }];
}

function fromRiskRadar(radar?: any): AgentOwnerInboxItem[] {
  const risk = radar?.items?.[0];
  if (!risk) return [];
  return [{
    id: `risk-${risk.id}`,
    lane: risk.horizon === "now" ? "decide" : "watch",
    priority: risk.severity === "critical" || risk.severity === "high" ? "high" : risk.severity === "medium" ? "medium" : "low",
    title: `예방 확인: ${risk.title}`,
    reason: risk.why,
    action: risk.prompt,
    location: "/admin/bot Risk Radar",
    owner: risk.horizon === "now" ? "admin" : "agent",
    source: "risk_radar"
  }];
}

function fromDelegations(input: Parameters<typeof buildAgentOwnerInbox>[0]): AgentOwnerInboxItem[] {
  const items = [
    input.operatorValue?.nextLeverage?.[0] && {
      id: "delegate-operator-value",
      title: input.operatorValue.nextLeverage[0].title,
      reason: input.operatorValue.nextLeverage[0].reason,
      action: input.operatorValue.nextLeverage[0].prompt,
      source: "operator_value"
    },
    input.growthRoadmap?.lanes?.thisWeek?.[0] && {
      id: "delegate-growth-roadmap",
      title: input.growthRoadmap.lanes.thisWeek[0].title,
      reason: input.growthRoadmap.lanes.thisWeek[0].expectedValue,
      action: input.growthRoadmap.lanes.thisWeek[0].prompt,
      source: "growth_roadmap"
    },
    input.operatingSop?.procedures?.[0] && {
      id: "delegate-operating-sop",
      title: input.operatingSop.procedures[0].title,
      reason: input.operatingSop.procedures[0].why,
      action: input.operatingSop.procedures[0].nextPrompt,
      source: "operating_sop"
    }
  ].filter(Boolean);

  return items.map((item: any) => ({
    id: item.id,
    lane: "delegate" as const,
    priority: "medium" as const,
    title: item.title,
    reason: item.reason,
    action: item.action,
    location: "/admin/bot 채팅",
    owner: "agent" as const,
    source: item.source
  }));
}

function fromPendingApprovals(pending?: any): AgentOwnerInboxItem[] {
  if (!pending?.count) return [];
  return [{
    id: "pending-approvals-summary",
    lane: "approve",
    priority: pending.highRiskCount || pending.staleCount ? "high" : "medium",
    title: "승인 대기열 확인",
    reason: `pending ${pending.count}건, high ${pending.highRiskCount || 0}건, stale ${pending.staleCount || 0}건`,
    action: "승인 대기 요청을 승인/거절/보류 권고로 나눠줘",
    location: "/admin/bot 승인 패널",
    owner: "admin",
    source: "pending_approvals"
  }];
}

function dedupeItems(items: AgentOwnerInboxItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.lane}:${item.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSummary(status: AgentOwnerInbox["status"], counts: AgentOwnerInbox["counts"]) {
  if (status === "attention") return `직접 결정 ${counts.decide}개, 승인 확인 ${counts.approve}개가 있습니다.`;
  if (status === "review") return `위임 ${counts.delegate}개, 관찰 ${counts.watch}개를 처리하면 됩니다.`;
  return "운영자 inbox가 비어 있습니다. 브리핑이나 리포트 저장 루틴을 실행하세요.";
}

function decisionLabel(decision: string) {
  if (decision === "reject") return "거절";
  if (decision === "defer") return "보류";
  return "승인 후보";
}

function priorityRank(priority: AgentOwnerInboxItem["priority"]) {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function laneRank(lane: AgentOwnerInboxLane) {
  return ["decide", "approve", "delegate", "watch"].indexOf(lane);
}
