export type AgentFinalReadinessItem = {
  id: "security" | "approval" | "diagnostics" | "automation" | "usability" | "learning" | "content" | "verification";
  title: string;
  status: "pass" | "watch" | "block";
  score: number;
  proof: string[];
  gap: string;
  prompt: string;
};

export type AgentFinalReadiness = {
  generatedAt: string;
  status: "ready" | "watch" | "blocked";
  score: number;
  summary: string;
  items: AgentFinalReadinessItem[];
  remainingWork: string[];
  proofPrompts: string[];
};

export function buildAgentFinalReadiness(input: {
  readiness?: any;
  rollout?: any;
  capabilityMatrix?: any;
  automationContracts?: any;
  safetyAudit?: any;
  approvalAdvisor?: any;
  missionControl?: any;
  ownerInbox?: any;
  outcomeReview?: any;
  operatorCoach?: any;
  launchKit?: any;
  monitorTrend?: any;
  contentPerformance?: any;
  pendingApprovals?: any;
  approvalGateSummary?: any;
  toolCatalog?: any;
}): AgentFinalReadiness {
  const items = buildItems(input);
  const score = Math.round(items.reduce((sum, item) => sum + item.score, 0) / Math.max(items.length, 1));
  const status = items.some((item) => item.status === "block")
    ? "blocked"
    : score < 85 || items.some((item) => item.status === "watch")
      ? "watch"
      : "ready";
  const remainingWork = items
    .filter((item) => item.status !== "pass")
    .map((item) => `${item.title}: ${item.gap}`)
    .slice(0, 8);
  const proofPrompts = uniqueCompact([
    input.launchKit?.firstPrompt,
    input.missionControl?.firstCommand,
    input.approvalAdvisor?.primaryPrompt,
    input.outcomeReview?.primaryPrompt,
    input.operatorCoach?.topPrompt,
    ...items.map((item) => item.prompt)
  ]).slice(0, 8);

  return {
    generatedAt: new Date().toISOString(),
    status,
    score,
    summary: buildSummary(status, score, items),
    items,
    remainingWork,
    proofPrompts
  };
}

function buildItems(input: Parameters<typeof buildAgentFinalReadiness>[0]): AgentFinalReadinessItem[] {
  const capability = (id: string) => input.capabilityMatrix?.items?.find((item: any) => item.id === id);
  const dangerousTools = Number(input.toolCatalog?.counts?.dangerous || 0);
  const readTools = Number(input.toolCatalog?.counts?.read || 0);
  const gateBlockCount = Number(input.approvalGateSummary?.blockCount || 0);
  const pendingCount = Number(input.pendingApprovals?.count || 0);
  const staleCount = Number(input.pendingApprovals?.staleCount || 0);

  return [
    {
      id: "security",
      title: "보안/권한 경계",
      ...statusFromSignals({
        block: input.safetyAudit?.status === "block" || input.readiness?.status === "critical" || input.rollout?.status === "fail",
        watch: input.safetyAudit?.status === "watch" || input.rollout?.status === "partial",
        score: input.safetyAudit?.score ?? capability("security")?.score ?? 70
      }),
      proof: [
        `Safety audit ${input.safetyAudit?.status || "unknown"} (${input.safetyAudit?.score ?? 0}/100)`,
        `Readiness ${input.readiness?.status || "unknown"}`,
        `Rollout ${input.rollout?.status || "unknown"}`
      ],
      gap: input.safetyAudit?.requiredFixes?.[0] || input.safetyAudit?.recommendedChecks?.[0] || "admin guard와 secret 노출 경계를 주기적으로 재확인하세요.",
      prompt: "Admin Agent 안전 감사 결과와 위험 승인 가능 여부를 점검해줘"
    },
    {
      id: "approval",
      title: "승인 기반 위험 실행",
      ...statusFromSignals({
        block: input.approvalAdvisor?.status === "blocked",
        watch: gateBlockCount > 0 || staleCount > 0 || pendingCount > 0 || input.approvalAdvisor?.status === "review",
        score: Math.max(55, 100 - gateBlockCount * 20 - staleCount * 12 - pendingCount * 4)
      }),
      proof: [
        `Dangerous tools ${dangerousTools}개는 approval-required로 분리`,
        `Approval advisor ${input.approvalAdvisor?.status || "unknown"}`,
        `Gate pass/review/block ${input.approvalGateSummary?.passCount ?? 0}/${input.approvalGateSummary?.reviewCount ?? 0}/${gateBlockCount}`
      ],
      gap: gateBlockCount > 0 ? "Execution Gate block 요청을 재생성하거나 보류하세요." : "승인 전 impact와 실행 결과를 계속 확인하세요.",
      prompt: "승인 대기 요청을 승인/거절/보류 권고로 나눠줘"
    },
    {
      id: "diagnostics",
      title: "운영 진단 능력",
      ...statusFromCapability(capability("observe"), capability("diagnose"), readTools >= 10),
      proof: [
        `Read tools ${readTools}개`,
        `Observe ${capability("observe")?.status || "unknown"} (${capability("observe")?.score ?? 0}/100)`,
        `Diagnose ${capability("diagnose")?.status || "unknown"} (${capability("diagnose")?.score ?? 0}/100)`
      ],
      gap: capability("diagnose")?.nextStep || "PUBG/API/AI/R2/배포 진단 도구를 실제 운영 질문으로 반복 검증하세요.",
      prompt: "최근 운영 상태를 Mission Control로 진단하고 첫 실행 순서를 정리해줘"
    },
    {
      id: "automation",
      title: "무료 플랜 자동화 계약",
      ...statusFromCapability(capability("monitor"), capability("free_plan"), Boolean(input.automationContracts)),
      proof: [
        input.automationContracts?.summary || "Automation contract missing",
        `Free-plan capability ${capability("free_plan")?.status || "unknown"} (${capability("free_plan")?.score ?? 0}/100)`,
        `Monitor trend ${input.monitorTrend?.label || "unknown"}`
      ],
      gap: capability("free_plan")?.nextStep || "긴 작업은 GitHub Actions에 두고 Agent는 snapshot/approval/alert에 집중하세요.",
      prompt: "현재 자동화 계약과 무료 플랜 guardrail을 요약해줘"
    },
    {
      id: "usability",
      title: "운영자 사용성",
      ...statusFromSignals({
        block: !input.launchKit,
        watch: input.ownerInbox?.status === "attention" || input.missionControl?.status === "urgent",
        score: input.launchKit?.status === "ready" ? 94 : input.launchKit?.status === "watch" ? 82 : 68
      }),
      proof: [
        `Launch kit ${input.launchKit?.status || "missing"}`,
        `Mission control ${input.missionControl?.status || "unknown"}`,
        `Owner inbox ${input.ownerInbox?.status || "unknown"}`
      ],
      gap: input.launchKit?.summary || "첫 프롬프트, 루틴, guardrail을 한 화면에서 확인하게 유지하세요.",
      prompt: "Agent Launch Kit으로 오늘부터 쓰는 법을 정리해줘"
    },
    {
      id: "learning",
      title: "운영 기억/학습 루프",
      ...statusFromCapability(capability("learn"), undefined, Boolean(input.outcomeReview)),
      proof: [
        `Learn capability ${capability("learn")?.status || "unknown"} (${capability("learn")?.score ?? 0}/100)`,
        `Outcome review ${input.outcomeReview?.status || "unknown"} (${input.outcomeReview?.score ?? 0}/100)`
      ],
      gap: capability("learn")?.nextStep || "반복 장애/정책은 approval-backed memory로 축적하세요.",
      prompt: "지난번 비슷한 장애 기억이 있는지 찾아주고 저장할 새 memory 후보를 제안해줘"
    },
    {
      id: "content",
      title: "콘텐츠 운영 보조",
      ...statusFromCapability(capability("content"), undefined, Boolean(input.contentPerformance)),
      proof: [
        `Content capability ${capability("content")?.status || "unknown"} (${capability("content")?.score ?? 0}/100)`,
        `Content performance ${input.contentPerformance?.totalPosts ?? 0} posts / ${input.contentPerformance?.totalViews ?? 0} views`
      ],
      gap: capability("content")?.nextStep || "성과 분석 후 발행은 approval queue로만 진행하세요.",
      prompt: "최근 게시글 성과를 분석하고 다음 콘텐츠를 추천해줘"
    },
    {
      id: "verification",
      title: "결과 검증/증거화",
      ...statusFromSignals({
        block: false,
        watch: input.outcomeReview?.status !== "closed" || input.monitorTrend?.direction === "insufficient_data",
        score: Math.round(((input.outcomeReview?.score ?? 70) + (input.monitorTrend?.direction === "worsening" ? 65 : input.monitorTrend?.direction === "insufficient_data" ? 72 : 90)) / 2)
      }),
      proof: [
        `Outcome review ${input.outcomeReview?.status || "unknown"} (${input.outcomeReview?.score ?? 0}/100)`,
        `Monitor trend ${input.monitorTrend?.direction || "unknown"}`
      ],
      gap: "조치 후 Outcome Review와 monitor trend로 루프가 닫혔는지 확인하세요.",
      prompt: "Outcome Review로 최근 조치가 효과 있었는지 검토해줘"
    }
  ];
}

function statusFromCapability(primary?: any, secondary?: any, present = true) {
  const scores = [primary?.score, secondary?.score].filter((value) => typeof value === "number");
  const score = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : present ? 78 : 60;
  const blocked = [primary?.status, secondary?.status].includes("blocked") || !present;
  const partial = [primary?.status, secondary?.status].includes("partial") || score < 85;
  return {
    status: blocked ? "block" as const : partial ? "watch" as const : "pass" as const,
    score
  };
}

function statusFromSignals(input: { block: boolean; watch: boolean; score: number }) {
  return {
    status: input.block ? "block" as const : input.watch ? "watch" as const : "pass" as const,
    score: Math.max(0, Math.min(100, Math.round(input.score)))
  };
}

function buildSummary(status: AgentFinalReadiness["status"], score: number, items: AgentFinalReadinessItem[]) {
  const watchCount = items.filter((item) => item.status === "watch").length;
  const blockCount = items.filter((item) => item.status === "block").length;
  if (status === "blocked") {
    return `최종형 운영 에이전트로 쓰기 전에 block ${blockCount}개를 먼저 해결해야 합니다. 현재 점수는 ${score}/100입니다.`;
  }
  if (status === "watch") {
    return `운영 투입은 가능하지만 watch ${watchCount}개를 계속 확인해야 합니다. 현재 완성도 점수는 ${score}/100입니다.`;
  }
  return `보안, 승인, 진단, 자동화, 사용성, 학습, 콘텐츠, 검증 축이 모두 통과했습니다. 현재 완성도 점수는 ${score}/100입니다.`;
}

function uniqueCompact(items: Array<string | null | undefined>) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}
