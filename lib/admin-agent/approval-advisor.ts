import type { ApprovalGateSummary, ApprovalQueueSummary } from "./approvals";

export type AgentApprovalAdviceDecision = "approve" | "reject" | "defer";

export interface AgentApprovalAdviceItem {
  id: string;
  actionType: string;
  title: string;
  priority: "low" | "medium" | "high";
  decision: AgentApprovalAdviceDecision;
  confidence: "high" | "medium" | "low";
  reason: string;
  checklist: string[];
  riskFlags: string[];
  prompt: string;
}

export interface AgentApprovalAdvisor {
  generatedAt: string;
  status: "clear" | "review" | "blocked";
  summary: string;
  counts: Record<AgentApprovalAdviceDecision, number>;
  items: AgentApprovalAdviceItem[];
  primaryPrompt: string;
}

export function buildAgentApprovalAdvisor(input: {
  pendingApprovals?: ApprovalQueueSummary;
  approvalGateSummary?: ApprovalGateSummary;
  safetyAudit?: any;
  riskRadar?: any;
}): AgentApprovalAdvisor {
  const queueItems = input.pendingApprovals?.items || [];
  const gateItems = input.approvalGateSummary?.items || [];
  const items = queueItems.map((approval) => {
    const gate = gateItems.find((item) => item.id === approval.id)?.gate || null;
    return adviseApproval({
      approval,
      gate,
      safetyAudit: input.safetyAudit,
      riskRadar: input.riskRadar
    });
  }).sort((a, b) => decisionRank(a.decision) - decisionRank(b.decision) || priorityRank(b.priority) - priorityRank(a.priority));
  const counts = {
    approve: items.filter((item) => item.decision === "approve").length,
    reject: items.filter((item) => item.decision === "reject").length,
    defer: items.filter((item) => item.decision === "defer").length
  };
  const status = counts.reject > 0 ? "blocked" : counts.defer > 0 ? "review" : "clear";
  const primary = items[0];

  return {
    generatedAt: new Date().toISOString(),
    status,
    summary: buildSummary(status, counts, input),
    counts,
    items,
    primaryPrompt: primary?.prompt || "승인 대기 작업을 impact 기준으로 검토해줘"
  };
}

function adviseApproval(input: {
  approval: ApprovalQueueSummary["items"][number];
  gate: ApprovalGateSummary["items"][number]["gate"] | null;
  safetyAudit?: any;
  riskRadar?: any;
}): AgentApprovalAdviceItem {
  const { approval, gate } = input;
  const riskFlags = [
    approval.priority === "high" ? "high-risk" : null,
    approval.isStale ? "stale" : null,
    gate?.status === "block" ? "gate-block" : null,
    gate?.status === "review" ? "gate-review" : null,
    input.safetyAudit?.status === "block" ? "safety-block" : null,
    input.riskRadar?.status === "act" ? "risk-radar-act" : null
  ].filter(Boolean) as string[];
  const title = String(approval.payload?.title || approval.payload?.cleanupType || approval.action_type);

  if (gate?.status === "block") {
    return item({
      approval,
      title,
      decision: "reject",
      confidence: "high",
      reason: `Execution Gate가 block입니다: ${gate.reasons.join(", ")}`,
      checklist: [
        "승인하지 않습니다.",
        "필수 대상값을 채운 새 요청을 만들거나 거절 사유를 남깁니다.",
        ...gate.requiredBeforeApproval.slice(0, 2)
      ],
      riskFlags,
      prompt: `승인 요청 ${approval.id}의 Execution Gate 차단 사유와 재요청 방법을 정리해줘`
    });
  }

  if (input.safetyAudit?.status === "block") {
    return item({
      approval,
      title,
      decision: "defer",
      confidence: "high",
      reason: "Agent Safety Audit가 block 상태입니다. 안전 invariant를 먼저 복구해야 합니다.",
      checklist: [
        "Safety Audit required fix를 먼저 처리합니다.",
        "고위험 승인 실행은 보류합니다.",
        "수정 후 approval impact를 다시 확인합니다."
      ],
      riskFlags,
      prompt: "Admin Agent 안전 감사 결과와 위험 승인 가능 여부를 점검해줘"
    });
  }

  if (approval.priority === "high" || gate?.status === "review" || input.riskRadar?.status === "act") {
    return item({
      approval,
      title,
      decision: "defer",
      confidence: approval.priority === "high" ? "high" : "medium",
      reason: approval.priority === "high"
        ? "고위험 작업입니다. impact, confirmedImpact, 실행 시간대를 확인한 뒤 승인해야 합니다."
        : "추가 검토 신호가 있어 즉시 승인보다 영향 확인이 우선입니다.",
      checklist: [
        "impact summary와 preview를 확인합니다.",
        "Execution Gate가 pass인지 확인합니다.",
        "고위험 작업은 confirmedImpact 확인 후에만 승인합니다."
      ],
      riskFlags,
      prompt: "승인 대기 작업을 impact 기준으로 검토해줘"
    });
  }

  if (approval.isStale) {
    return item({
      approval,
      title,
      decision: "defer",
      confidence: "medium",
      reason: `${approval.ageHours}시간 된 오래된 요청입니다. 요청 맥락이 아직 유효한지 다시 확인해야 합니다.`,
      checklist: [
        "요청자가 의도한 작업인지 확인합니다.",
        "최근 운영 상태와 충돌하지 않는지 확인합니다.",
        "필요하면 거절 후 새 요청을 만듭니다."
      ],
      riskFlags,
      prompt: "승인 대기 작업을 impact 기준으로 검토해줘"
    });
  }

  return item({
    approval,
    title,
    decision: "approve",
    confidence: "medium",
    reason: "현재 gate 차단이나 고위험 신호가 없는 승인 요청입니다. preview와 payload가 의도와 맞으면 승인 후보입니다.",
    checklist: [
      "payload와 preview가 의도와 맞는지 확인합니다.",
      "승인 메모를 짧게 남깁니다.",
      "실행 후 approval result를 확인합니다."
    ],
    riskFlags,
    prompt: `승인 요청 ${approval.id}의 payload와 실행 전 체크리스트를 요약해줘`
  });
}

function item(input: {
  approval: ApprovalQueueSummary["items"][number];
  title: string;
  decision: AgentApprovalAdviceDecision;
  confidence: AgentApprovalAdviceItem["confidence"];
  reason: string;
  checklist: string[];
  riskFlags: string[];
  prompt: string;
}): AgentApprovalAdviceItem {
  return {
    id: input.approval.id,
    actionType: input.approval.action_type,
    title: input.title,
    priority: input.approval.priority,
    decision: input.decision,
    confidence: input.confidence,
    reason: input.reason,
    checklist: input.checklist,
    riskFlags: input.riskFlags,
    prompt: input.prompt
  };
}

function buildSummary(status: AgentApprovalAdvisor["status"], counts: AgentApprovalAdvisor["counts"], input: Parameters<typeof buildAgentApprovalAdvisor>[0]) {
  const total = input.pendingApprovals?.count || 0;
  if (!total) return "승인 대기 요청이 없습니다.";
  if (status === "blocked") return `승인 대기 ${total}건 중 거절/재요청 권고 ${counts.reject}건이 있습니다. block 요청은 승인하지 마세요.`;
  if (status === "review") return `승인 대기 ${total}건 중 보류 검토 ${counts.defer}건, 승인 후보 ${counts.approve}건입니다. impact 확인이 우선입니다.`;
  return `승인 대기 ${total}건은 즉시 차단 신호가 없습니다. preview와 payload 확인 후 승인 후보로 볼 수 있습니다.`;
}

function decisionRank(decision: AgentApprovalAdviceDecision) {
  if (decision === "reject") return 0;
  if (decision === "defer") return 1;
  return 2;
}

function priorityRank(priority: "low" | "medium" | "high") {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}
