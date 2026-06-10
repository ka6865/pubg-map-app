export type AgentImprovementPriority = "low" | "medium" | "high";

export type AgentImprovementBacklogItem = {
  id: string;
  priority: AgentImprovementPriority;
  title: string;
  reason: string;
  action: string;
  owner: "admin" | "agent" | "developer";
};

export type AgentImprovementBacklog = {
  score: number;
  label: "excellent" | "stable" | "needs_attention" | "at_risk";
  summary: string;
  items: AgentImprovementBacklogItem[];
};

export function buildAgentImprovementBacklog(input: {
  readiness: any;
  rollout: any;
  pendingApprovals: {
    count: number;
    highRiskCount?: number;
    staleCount?: number;
  };
  approvalGateSummary?: {
    sampledCount: number;
    passCount: number;
    reviewCount: number;
    blockCount: number;
    items?: Array<{
      id: string;
      actionType: string;
      title: string;
      gate: { status: "pass" | "review" | "block"; reasons: string[] };
    }>;
  };
  failedRuns: { count: number };
  apiErrors: { total: number };
  aiUsage: { totalCostUsd: number };
  deploymentHealth?: { configured?: boolean; severity?: "ok" | "warn" | "critical" };
  memories?: { items?: any[]; error?: string };
  latestReport?: { item?: any | null; error?: string };
  contentPerformance?: { totalPosts?: number; recommendations?: string[]; error?: string };
  thresholds: {
    aiCostWarnUsd: number;
    aiCostCriticalUsd: number;
  };
}): AgentImprovementBacklog {
  const items = buildItems(input);
  const score = calculateMaturityScore(input, items);
  const label = getScoreLabel(score);

  return {
    score,
    label,
    summary: buildSummary(label, score, items),
    items: items
      .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority))
      .slice(0, 6)
  };
}

function buildItems(input: Parameters<typeof buildAgentImprovementBacklog>[0]): AgentImprovementBacklogItem[] {
  const items: AgentImprovementBacklogItem[] = [];
  const readinessIssues = (input.readiness?.checks || []).filter((check: any) => check.status && check.status !== "ok");
  const rolloutIssues = (input.rollout?.checks || []).filter((check: any) => check.status && check.status !== "pass");
  const requiredEnvIssues = readinessIssues.filter((check: any) => check.id?.startsWith("env:") && check.status === "critical");
  const optionalEnvIssues = readinessIssues.filter((check: any) => check.id?.startsWith("env:") && check.status === "warn");

  if (requiredEnvIssues.length) {
    items.push({
      id: "fix-required-agent-env",
      priority: "high",
      title: "필수 Agent env 보강",
      reason: `${requiredEnvIssues.length}개 필수 env가 critical 상태입니다.`,
      action: "Agent Readiness에서 critical env를 확인하고 Vercel/GitHub Actions 환경변수에 반영하세요.",
      owner: "admin"
    });
  }

  if (rolloutIssues.some((check: any) => check.status === "fail")) {
    items.push({
      id: "clear-rollout-blockers",
      priority: "high",
      title: "Rollout fail 항목 해소",
      reason: "배포 전 점검에 fail 항목이 있습니다.",
      action: "Rollout Readiness의 fail 체크를 먼저 해결한 뒤 배포나 위험 승인을 진행하세요.",
      owner: "developer"
    });
  }

  if ((input.pendingApprovals.staleCount || 0) > 0) {
    items.push({
      id: "resolve-stale-approvals",
      priority: "high",
      title: "오래된 승인 요청 정리",
      reason: `stale approval ${input.pendingApprovals.staleCount}건이 남아 있습니다.`,
      action: "승인 패널의 오래됨 필터에서 중복/불필요 요청은 거절하고 필요한 요청만 실행하세요.",
      owner: "admin"
    });
  }

  if ((input.approvalGateSummary?.blockCount || 0) > 0) {
    const blocked = input.approvalGateSummary?.items?.find((item) => item.gate.status === "block");
    items.push({
      id: "regenerate-blocked-approvals",
      priority: "high",
      title: "차단된 승인 요청 재생성",
      reason: `Execution Gate block ${input.approvalGateSummary?.blockCount}건이 있습니다.${blocked ? ` 예: ${blocked.title}` : ""}`,
      action: "승인 패널에서 block 사유를 확인하고 필수 대상값을 채운 요청으로 다시 생성하세요.",
      owner: "admin"
    });
  }

  if ((input.pendingApprovals.highRiskCount || 0) > 0) {
    items.push({
      id: "review-high-risk-approvals",
      priority: "high",
      title: "고위험 승인 영향 재검토",
      reason: `고위험 approval ${input.pendingApprovals.highRiskCount}건이 대기 중입니다.`,
      action: "Execution Gate, impact, 예상 row, 승인 메모를 확인한 뒤 낮은 트래픽 시간대에 처리하세요.",
      owner: "admin"
    });
  }

  if (input.failedRuns.count > 0) {
    items.push({
      id: "reduce-agent-run-failures",
      priority: "high",
      title: "Agent run 실패 원인 제거",
      reason: `최근 실패 run ${input.failedRuns.count}건이 있습니다.`,
      action: "Timeline Export로 실패 step과 params/result를 확인하고 memory에 재발 방지책을 저장하세요.",
      owner: "agent"
    });
  }

  if (input.apiErrors.total > 0) {
    items.push({
      id: "harden-pubg-api-operations",
      priority: "medium",
      title: "PUBG API 장애 대응 강화",
      reason: `최근 API error ${input.apiErrors.total}건이 있습니다.`,
      action: "route/status별 원인을 확인하고 quota 보호, 캐시 우선, 재시도 정책을 점검하세요.",
      owner: "agent"
    });
  }

  if (input.aiUsage.totalCostUsd >= input.thresholds.aiCostWarnUsd) {
    items.push({
      id: "optimize-ai-cost",
      priority: input.aiUsage.totalCostUsd >= input.thresholds.aiCostCriticalUsd ? "high" : "medium",
      title: "AI 비용 최적화",
      reason: `최근 AI 비용 $${input.aiUsage.totalCostUsd.toFixed(4)}가 임계치에 접근했습니다.`,
      action: "반복 분석은 saved report/memory를 우선 재사용하고 긴 콘텐츠 생성은 승인 흐름으로 묶으세요.",
      owner: "agent"
    });
  }

  if (input.deploymentHealth?.configured === false) {
    items.push({
      id: "configure-deployment-health",
      priority: "medium",
      title: "배포 상태 감시 연결",
      reason: "Vercel 배포 감시 env가 설정되지 않아 배포 실패 분석이 제한됩니다.",
      action: "필요하면 VERCEL_TOKEN과 VERCEL_PROJECT_ID를 설정해 배포 실패를 command center에 연결하세요.",
      owner: "admin"
    });
  } else if (input.deploymentHealth?.severity && input.deploymentHealth.severity !== "ok") {
    items.push({
      id: "fix-deployment-health",
      priority: input.deploymentHealth.severity === "critical" ? "high" : "medium",
      title: "배포 상태 이슈 해결",
      reason: `Deployment health가 ${input.deploymentHealth.severity} 상태입니다.`,
      action: "최근 실패 배포와 build/runtime log를 확인하고 rollout readiness를 다시 실행하세요.",
      owner: "developer"
    });
  }

  if (optionalEnvIssues.some((check: any) => check.id === "env:DISCORD_WEBHOOK_URL")) {
    items.push({
      id: "wire-discord-alerts",
      priority: "medium",
      title: "Discord 위험 알림 연결",
      reason: "Discord webhook이 없어 위험 alert가 외부로 전달되지 않습니다.",
      action: "DISCORD_WEBHOOK_URL을 설정하면 위험 조건에서만 짧은 운영 알림을 받을 수 있습니다.",
      owner: "admin"
    });
  }

  if (!input.latestReport?.item) {
    items.push({
      id: "start-daily-report-memory",
      priority: "low",
      title: "일일 운영 리포트 기록 시작",
      reason: "저장된 최신 운영 리포트가 없습니다.",
      action: "`오늘 운영 브리핑을 리포트로 저장 요청해줘`를 실행하고 승인 패널에서 저장하세요.",
      owner: "agent"
    });
  }

  if (!input.memories?.items?.length) {
    items.push({
      id: "seed-incident-memory",
      priority: "low",
      title: "운영 memory seed 저장",
      reason: "관련 memory가 부족하면 반복 장애 인식 품질이 낮아집니다.",
      action: "최근 해결한 장애나 운영 정책을 `이번 대응 내용을 memory로 저장해줘`로 저장하세요.",
      owner: "agent"
    });
  }

  if ((input.contentPerformance?.totalPosts || 0) === 0 || input.contentPerformance?.error) {
    items.push({
      id: "connect-content-feedback-loop",
      priority: "low",
      title: "콘텐츠 성과 루프 보강",
      reason: input.contentPerformance?.error || "최근 게시글 성과 데이터가 부족합니다.",
      action: "게시글 성과 분석을 한 번 실행하고 주간 발행 계획을 콘텐츠 초안에 반영하세요.",
      owner: "agent"
    });
  }

  if (!items.length) {
    items.push({
      id: "keep-agent-operational-rhythm",
      priority: "low",
      title: "정상 운영 리듬 유지",
      reason: "핵심 readiness와 운영 신호가 안정적입니다.",
      action: "일일 monitor snapshot, 주간 content performance, 월간 memory 정리를 유지하세요.",
      owner: "admin"
    });
  }

  return items;
}

function calculateMaturityScore(
  input: Parameters<typeof buildAgentImprovementBacklog>[0],
  items: AgentImprovementBacklogItem[]
) {
  const penalty =
    items.filter((item) => item.priority === "high").length * 16
    + items.filter((item) => item.priority === "medium").length * 8
    + items.filter((item) => item.priority === "low").length * 3
    + (input.readiness?.status === "critical" ? 20 : input.readiness?.status === "warn" ? 8 : 0)
    + (input.rollout?.status === "fail" ? 20 : input.rollout?.status === "warn" ? 8 : 0);

  return Math.max(0, Math.min(100, 100 - penalty));
}

function getScoreLabel(score: number): AgentImprovementBacklog["label"] {
  if (score >= 85) return "excellent";
  if (score >= 70) return "stable";
  if (score >= 45) return "needs_attention";
  return "at_risk";
}

function buildSummary(
  label: AgentImprovementBacklog["label"],
  score: number,
  items: AgentImprovementBacklogItem[]
) {
  const top = items[0];
  if (label === "excellent") return `Agent maturity ${score}/100. 운영 리듬이 안정적이며 다음 개선은 ${top.title}입니다.`;
  if (label === "stable") return `Agent maturity ${score}/100. 안정권이지만 ${top.title}를 먼저 보강하면 좋습니다.`;
  if (label === "needs_attention") return `Agent maturity ${score}/100. ${top.title}부터 처리해야 품질이 올라갑니다.`;
  return `Agent maturity ${score}/100. ${top.title}가 운영 리스크를 키우고 있습니다.`;
}

function priorityWeight(priority: AgentImprovementPriority) {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}
