import type { AgentDailyCheckout } from "./daily-checkout";
import type { AgentNextAction } from "./next-actions";

export type AgentTodayActionBoardItem = {
  id: string;
  lane: "do_now" | "review" | "watch" | "save";
  priority: "low" | "medium" | "high";
  title: string;
  reason: string;
  prompt: string;
  expectedOutcome: string;
  checklist: string[];
  score: number;
  source: "next_action" | "checkout" | "approval_gate" | "report";
};

export type AgentTodayActionBoard = {
  generatedAt: string;
  status: "clear" | "attention" | "blocked";
  summary: string;
  primaryPrompt: string;
  lanes: {
    doNow: AgentTodayActionBoardItem[];
    review: AgentTodayActionBoardItem[];
    watch: AgentTodayActionBoardItem[];
    save: AgentTodayActionBoardItem[];
  };
};

export function buildTodayActionBoard(input: {
  dailyCheckout?: AgentDailyCheckout;
  nextActions?: AgentNextAction[];
  approvalGateSummary?: { blockCount?: number; reviewCount?: number };
  pendingApprovals?: { count?: number; highRiskCount?: number; staleCount?: number };
  latestReport?: { item?: { title?: string } | null };
}): AgentTodayActionBoard {
  const checkout = input.dailyCheckout;
  const actions = input.nextActions || [];
  const items = [
    ...buildGateItems(input),
    ...actions.map((action) => itemFromNextAction(action)),
    ...buildCheckoutItems(checkout, input.latestReport)
  ];
  const uniqueItems = dedupeItems(items)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const lanes = {
    doNow: uniqueItems.filter((item) => item.lane === "do_now").slice(0, 3),
    review: uniqueItems.filter((item) => item.lane === "review").slice(0, 3),
    watch: uniqueItems.filter((item) => item.lane === "watch").slice(0, 3),
    save: uniqueItems.filter((item) => item.lane === "save").slice(0, 2)
  };

  return {
    generatedAt: new Date().toISOString(),
    status: checkout?.status || (lanes.doNow.length ? "attention" : "clear"),
    summary: buildSummary(checkout, lanes),
    primaryPrompt: lanes.doNow[0]?.prompt || lanes.review[0]?.prompt || checkout?.handoffPrompt || "오늘 운영 브리핑 해줘",
    lanes
  };
}

function buildGateItems(input: {
  approvalGateSummary?: { blockCount?: number; reviewCount?: number };
  pendingApprovals?: { count?: number; highRiskCount?: number; staleCount?: number };
}): AgentTodayActionBoardItem[] {
  const items: AgentTodayActionBoardItem[] = [];
  if ((input.approvalGateSummary?.blockCount || 0) > 0) {
    items.push({
      id: "resolve-approval-gate-blocks",
      lane: "do_now",
      priority: "high",
      title: "Execution Gate block 해소",
      reason: `필수 대상값이 빠진 승인 요청 ${input.approvalGateSummary?.blockCount || 0}건이 있습니다.`,
      prompt: "Execution Gate block 승인 요청을 원인과 재생성 기준으로 정리해줘",
      expectedOutcome: "승인하면 안 되는 요청과 다시 만들어야 할 요청을 분리합니다.",
      checklist: [
        "matchId/player/title/body 같은 필수 대상값 확인",
        "block 요청은 승인하지 않고 거절 사유 기록",
        "필요하면 정확한 대상값으로 새 승인 요청 생성"
      ],
      score: 100,
      source: "approval_gate"
    });
  }
  if ((input.pendingApprovals?.staleCount || 0) > 0 || (input.pendingApprovals?.highRiskCount || 0) > 0) {
    items.push({
      id: "review-stale-high-risk-approvals",
      lane: "review",
      priority: "high",
      title: "오래된/고위험 승인 검토",
      reason: `stale ${input.pendingApprovals?.staleCount || 0}건, high risk ${input.pendingApprovals?.highRiskCount || 0}건`,
      prompt: "오래된 승인과 고위험 승인 요청을 먼저 처리할 순서로 정리해줘",
      expectedOutcome: "오래된 위험 작업의 승인/거절 기준을 정합니다.",
      checklist: [
        "impact preview와 estimated rows 확인",
        "고위험 작업은 낮은 트래픽 시간대 실행",
        "불필요하면 거절 사유 남기기"
      ],
      score: 86,
      source: "approval_gate"
    });
  }
  return items;
}

function itemFromNextAction(action: AgentNextAction): AgentTodayActionBoardItem {
  return {
    id: action.id,
    lane: laneForAction(action),
    priority: action.priority,
    title: action.title,
    reason: action.reason,
    prompt: action.prompt,
    expectedOutcome: action.expectedOutcome,
    checklist: action.checklist || [],
    score: action.urgencyScore || priorityScore(action.priority),
    source: "next_action"
  };
}

function buildCheckoutItems(checkout?: AgentDailyCheckout, latestReport?: { item?: { title?: string } | null }): AgentTodayActionBoardItem[] {
  if (!checkout) return [];
  if (checkout.status === "clear") {
    return [{
      id: "save-clear-daily-digest",
      lane: "save",
      priority: "low",
      title: "정상 운영 기록 저장",
      reason: latestReport?.item?.title ? `최근 리포트: ${latestReport.item.title}` : "운영 상태가 정상 범위입니다.",
      prompt: "오늘 운영 브리핑을 리포트로 저장 요청해줘",
      expectedOutcome: "정상 상태를 report memory로 남길 승인 요청을 만듭니다.",
      checklist: [
        "Daily Ops Digest 확인",
        "요약 저장으로 승인 요청 생성",
        "다음 점검 때 latest report 확인"
      ],
      score: 22,
      source: "report"
    }];
  }
  return [{
    id: "finish-daily-checkout",
    lane: checkout.status === "blocked" ? "do_now" : "review",
    priority: checkout.status === "blocked" ? "high" : "medium",
    title: checkout.label,
    reason: checkout.summary,
    prompt: checkout.handoffPrompt,
    expectedOutcome: "마감 전 남은 위험 신호를 줄입니다.",
    checklist: (checkout.openRisks || []).slice(0, 3),
    score: checkout.status === "blocked" ? 92 : 64,
    source: "checkout"
  }];
}

function laneForAction(action: AgentNextAction): AgentTodayActionBoardItem["lane"] {
  if (action.priority === "high" || action.urgencyScore >= 80) return "do_now";
  if (action.category === "approval" || action.category === "readiness" || action.category === "deploy") return "review";
  if (action.category === "report" || action.category === "content") return "save";
  return "watch";
}

function dedupeItems(items: AgentTodayActionBoardItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function buildSummary(checkout: AgentDailyCheckout | undefined, lanes: AgentTodayActionBoard["lanes"]) {
  const doNowCount = lanes.doNow.length;
  const reviewCount = lanes.review.length;
  const watchCount = lanes.watch.length;
  if (checkout?.status === "blocked") return `마감 전 즉시 처리 ${doNowCount}개, 검토 ${reviewCount}개가 있습니다.`;
  if (checkout?.status === "attention") return `주의 상태입니다. 검토 ${reviewCount}개와 관찰 ${watchCount}개를 처리하면 마감 가능합니다.`;
  return `운영 상태가 안정적입니다. 저장/공유 작업 ${lanes.save.length}개를 권장합니다.`;
}

function priorityScore(priority: AgentNextAction["priority"]) {
  if (priority === "high") return 78;
  if (priority === "medium") return 52;
  return 24;
}
