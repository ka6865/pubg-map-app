export type AgentMissionControlItem = {
  id: string;
  phase: "stabilize" | "decide" | "delegate" | "verify" | "record";
  priority: "low" | "medium" | "high";
  title: string;
  reason: string;
  command: string;
  owner: "admin" | "agent" | "github_actions" | "manual";
  expectedOutcome: string;
  source: string;
  guardrail: string;
};

export type AgentMissionControl = {
  generatedAt: string;
  status: "clear" | "focus" | "urgent";
  summary: string;
  firstCommand: string;
  items: AgentMissionControlItem[];
  phases: Record<AgentMissionControlItem["phase"], number>;
};

export function buildAgentMissionControl(input: {
  severity?: "ok" | "warn" | "critical";
  ownerBrief?: any;
  todayActionBoard?: any;
  approvalAdvisor?: any;
  operatingSop?: any;
  riskRadar?: any;
  safetyAudit?: any;
  dailyCheckout?: any;
  nextActions?: any[];
  latestReport?: any;
}): AgentMissionControl {
  const items = dedupeItems([
    ...buildSafetyItems(input),
    ...buildApprovalItems(input),
    ...buildBoardItems(input),
    ...buildSopItems(input),
    ...buildRiskItems(input),
    ...buildOwnerItems(input),
    ...buildRecordItems(input)
  ]).sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || phaseRank(a.phase) - phaseRank(b.phase)).slice(0, 8);
  const phases = {
    stabilize: items.filter((item) => item.phase === "stabilize").length,
    decide: items.filter((item) => item.phase === "decide").length,
    delegate: items.filter((item) => item.phase === "delegate").length,
    verify: items.filter((item) => item.phase === "verify").length,
    record: items.filter((item) => item.phase === "record").length
  };
  const status = input.severity === "critical"
    || input.safetyAudit?.status === "block"
    || input.approvalAdvisor?.status === "blocked"
    || phases.stabilize > 0
    ? "urgent"
    : input.severity === "warn" || input.approvalAdvisor?.status === "review" || items.some((item) => item.priority === "high")
      ? "focus"
      : "clear";

  return {
    generatedAt: new Date().toISOString(),
    status,
    summary: buildSummary(status, items),
    firstCommand: items[0]?.command || input.ownerBrief?.doNow?.prompt || "30초 운영자 브리핑으로 지금 할 일만 알려줘",
    items,
    phases
  };
}

function buildSafetyItems(input: Parameters<typeof buildAgentMissionControl>[0]): AgentMissionControlItem[] {
  if (input.safetyAudit?.status !== "block") return [];
  return [{
    id: "mission-safety-first",
    phase: "stabilize",
    priority: "high",
    title: "안전 invariant 먼저 복구",
    reason: input.safetyAudit.summary || "Safety Audit가 block 상태입니다.",
    command: input.safetyAudit.primaryPrompt || "Admin Agent 안전 감사 결과와 위험 승인 가능 여부를 점검해줘",
    owner: "agent",
    expectedOutcome: "위험 승인 전에 guardrail 차단 사유와 복구 순서를 확정합니다.",
    source: "safety_audit",
    guardrail: "위험 작업 승인/실행 금지. read-only 점검만 수행합니다."
  }];
}

function buildApprovalItems(input: Parameters<typeof buildAgentMissionControl>[0]): AgentMissionControlItem[] {
  const advisor = input.approvalAdvisor;
  if (!advisor?.items?.length) return [];
  return advisor.items.slice(0, 3).map((item: any) => ({
    id: `mission-approval-${item.id}`,
    phase: item.decision === "approve" ? "decide" : "stabilize",
    priority: item.decision === "reject" || item.priority === "high" ? "high" : item.decision === "defer" ? "medium" : "low",
    title: `${decisionLabel(item.decision)}: ${item.title}`,
    reason: item.reason,
    command: item.prompt,
    owner: "admin",
    expectedOutcome: `승인 요청 ${item.id}를 ${item.decision} 후보로 검토합니다.`,
    source: "approval_advisor",
    guardrail: item.decision === "approve"
      ? "승인은 관리자 확인 후에만 수행합니다."
      : "차단/보류 권고는 즉시 실행하지 않습니다."
  }));
}

function buildBoardItems(input: Parameters<typeof buildAgentMissionControl>[0]): AgentMissionControlItem[] {
  const board = input.todayActionBoard;
  const candidates = [
    ...(board?.lanes?.doNow || []),
    ...(board?.lanes?.review || [])
  ];
  return candidates.slice(0, 2).map((item: any) => ({
    id: `mission-board-${item.id}`,
    phase: item.lane === "do_now" ? "stabilize" : "decide",
    priority: item.priority,
    title: item.title,
    reason: item.reason,
    command: item.prompt,
    owner: "agent",
    expectedOutcome: item.expectedOutcome,
    source: "today_action_board",
    guardrail: item.source === "approval_gate" ? "승인 패널에서 impact/gate 확인 후 처리합니다." : "조회성 분석은 바로 실행 가능합니다."
  }));
}

function buildSopItems(input: Parameters<typeof buildAgentMissionControl>[0]): AgentMissionControlItem[] {
  const procedure = input.operatingSop?.procedures?.[0];
  if (!procedure) return [];
  return [{
    id: `mission-sop-${procedure.id}`,
    phase: procedure.risk === "read" ? "delegate" : "verify",
    priority: procedure.severity === "critical" ? "high" : procedure.severity === "warn" ? "medium" : "low",
    title: `SOP: ${procedure.title}`,
    reason: procedure.why,
    command: procedure.nextPrompt,
    owner: "agent",
    expectedOutcome: procedure.doneWhen?.[0] || "절차 완료 기준을 확인합니다.",
    source: "operating_sop",
    guardrail: procedure.risk === "approval_required" ? "승인 필요 작업은 승인 요청까지만 생성합니다." : "SOP는 실행 전 확인 순서를 제공합니다."
  }];
}

function buildRiskItems(input: Parameters<typeof buildAgentMissionControl>[0]): AgentMissionControlItem[] {
  const risk = input.riskRadar?.items?.[0];
  if (!risk) return [];
  return [{
    id: `mission-risk-${risk.id}`,
    phase: risk.horizon === "now" ? "stabilize" : "verify",
    priority: risk.severity === "critical" || risk.severity === "high" ? "high" : risk.severity === "medium" ? "medium" : "low",
    title: `예방: ${risk.title}`,
    reason: risk.why,
    command: risk.prompt,
    owner: "agent",
    expectedOutcome: risk.prevention,
    source: "risk_radar",
    guardrail: "예방 분석은 read-only로 수행하고 실행은 별도 승인 흐름을 따릅니다."
  }];
}

function buildOwnerItems(input: Parameters<typeof buildAgentMissionControl>[0]): AgentMissionControlItem[] {
  if (!input.ownerBrief?.doNow?.prompt) return [];
  return [{
    id: "mission-owner-do-now",
    phase: input.ownerBrief.status === "calm" ? "delegate" : "decide",
    priority: input.ownerBrief.status === "act_now" ? "high" : input.ownerBrief.status === "watch" ? "medium" : "low",
    title: input.ownerBrief.doNow.title,
    reason: input.ownerBrief.doNow.reason,
    command: input.ownerBrief.doNow.prompt,
    owner: "admin",
    expectedOutcome: "운영자가 지금 볼 1순위 판단을 끝냅니다.",
    source: "owner_brief",
    guardrail: "소유자 판단이 필요한 항목은 자동 실행하지 않습니다."
  }];
}

function buildRecordItems(input: Parameters<typeof buildAgentMissionControl>[0]): AgentMissionControlItem[] {
  const checkoutClear = input.dailyCheckout?.status === "clear";
  if (!checkoutClear && input.severity !== "ok") return [];
  return [{
    id: "mission-record-digest",
    phase: "record",
    priority: "low",
    title: "운영 기준선 기록",
    reason: input.latestReport?.item?.title ? `최근 리포트: ${input.latestReport.item.title}` : "정상 상태일수록 다음 이상 징후 비교 기준을 남기기 좋습니다.",
    command: "오늘 운영 브리핑을 리포트로 저장 요청해줘",
    owner: "agent",
    expectedOutcome: "정상/주의 기준선을 report memory 승인 요청으로 남깁니다.",
    source: "daily_checkout",
    guardrail: "리포트 저장도 승인 요청으로만 생성합니다."
  }];
}

function dedupeItems(items: AgentMissionControlItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.command || item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSummary(status: AgentMissionControl["status"], items: AgentMissionControlItem[]) {
  const high = items.filter((item) => item.priority === "high").length;
  const admin = items.filter((item) => item.owner === "admin").length;
  if (status === "urgent") return `즉시 처리 흐름입니다. high ${high}개, 관리자 판단 ${admin}개를 먼저 처리하세요.`;
  if (status === "focus") return `집중 점검 흐름입니다. ${items.length}개 명령을 순서대로 처리하면 운영 판단이 정리됩니다.`;
  return `안정 흐름입니다. 기록/성장 루틴 중심으로 ${items.length}개 명령을 제안합니다.`;
}

function decisionLabel(decision: string) {
  if (decision === "reject") return "거절 권고";
  if (decision === "defer") return "보류 권고";
  return "승인 후보";
}

function priorityRank(priority: AgentMissionControlItem["priority"]) {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function phaseRank(phase: AgentMissionControlItem["phase"]) {
  return ["stabilize", "decide", "delegate", "verify", "record"].indexOf(phase);
}
