export type AgentCapabilityStatus = "ready" | "partial" | "blocked";

export type AgentCapabilityMatrixItem = {
  id: "observe" | "diagnose" | "approve" | "monitor" | "learn" | "content" | "security" | "free_plan";
  label: string;
  status: AgentCapabilityStatus;
  score: number;
  evidence: string[];
  nextStep: string;
};

export type AgentCapabilityMatrix = {
  generatedAt: string;
  score: number;
  label: "excellent" | "stable" | "needs_attention" | "at_risk";
  summary: string;
  items: AgentCapabilityMatrixItem[];
};

export function buildAgentCapabilityMatrix(input: {
  readiness?: any;
  rollout?: any;
  toolCatalog?: any;
  pendingApprovals?: any;
  approvalGateSummary?: any;
  latestMonitorSnapshot?: any;
  dailyCheckout?: any;
  todayActionBoard?: any;
  memorySuggestions?: any[];
  contentPerformance?: any;
  deploymentHealth?: any;
  improvementBacklog?: any;
}): AgentCapabilityMatrix {
  const readinessChecks = input.readiness?.checks || [];
  const rolloutChecks = input.rollout?.checks || [];
  const tools = input.toolCatalog?.tools || [];

  const tableOk = (table: string) => readinessChecks.some((check: any) => check.id === `table:${table}` && check.status === "ok");
  const checkOk = (id: string) => readinessChecks.some((check: any) => check.id === id && check.status === "ok")
    || rolloutChecks.some((check: any) => check.id === id && check.status === "pass");
  const checkPass = (id: string) => rolloutChecks.some((check: any) => check.id === id && check.status === "pass");
  const hasTool = (name: string) => tools.some((tool: any) => tool.name === name);
  const countTools = (safetyLevel: string) => Number(input.toolCatalog?.counts?.[safetyLevel] || 0);

  const items: AgentCapabilityMatrixItem[] = [
    scoreCapability({
      id: "observe",
      label: "운영 관찰",
      passed: [
        tableOk("pubg_api_errors"),
        tableOk("ai_usage_logs"),
        tableOk("processed_match_telemetry"),
        Boolean(input.latestMonitorSnapshot?.item)
      ],
      evidence: [
        `PUBG/API/AI/telemetry tables ${[
          tableOk("pubg_api_errors"),
          tableOk("ai_usage_logs"),
          tableOk("processed_match_telemetry")
        ].filter(Boolean).length}/3 reachable`,
        input.latestMonitorSnapshot?.item
          ? `latest monitor ${input.latestMonitorSnapshot.item.severity}`
          : "latest monitor snapshot missing"
      ],
      nextStep: "monitor snapshot이 비어 있으면 GitHub Actions 마지막 단계에서 /api/admin/agent/monitor 호출을 확인하세요."
    }),
    scoreCapability({
      id: "diagnose",
      label: "원인 진단",
      passed: [
        hasTool("inspect_operations"),
        hasTool("inspect_incident_timeline"),
        hasTool("inspect_handoff_packet"),
        Boolean(input.dailyCheckout),
        Boolean(input.todayActionBoard)
      ],
      evidence: [
        `read tools ${countTools("read")}`,
        input.dailyCheckout ? `checkout ${input.dailyCheckout.label || input.dailyCheckout.status}` : "daily checkout missing",
        input.todayActionBoard ? `action board ${input.todayActionBoard.status}` : "today action board missing"
      ],
      nextStep: "진단 답변 품질이 낮으면 최근 장애 memory와 playbook을 먼저 보강하세요."
    }),
    scoreCapability({
      id: "approve",
      label: "승인 기반 실행",
      passed: [
        countTools("dangerous") > 0,
        checkOk("workflow:approval-loop"),
        checkOk("tools:safety-classification"),
        Boolean(input.approvalGateSummary)
      ],
      evidence: [
        `${countTools("dangerous")} dangerous tools require approval`,
        `pending ${input.pendingApprovals?.count || 0}, gate block ${input.approvalGateSummary?.blockCount || 0}`,
        checkOk("workflow:approval-loop") ? "approval loop self-test ok" : "approval loop self-test not ok"
      ],
      nextStep: "Execution Gate가 block인 요청은 승인하지 말고 payload를 보강해 새 승인 요청으로 만들도록 운영하세요."
    }),
    scoreCapability({
      id: "monitor",
      label: "자동 감시",
      passed: [
        checkPass("monitor-secret"),
        Boolean(input.latestMonitorSnapshot?.item),
        checkPass("discord-alert") || rolloutChecks.some((check: any) => check.id === "discord-alert" && check.status === "warn")
      ],
      evidence: [
        `monitor secret ${checkPass("monitor-secret") ? "configured" : "missing"}`,
        input.latestMonitorSnapshot?.item
          ? `alerts ${Array.isArray(input.latestMonitorSnapshot.item.alerts) ? input.latestMonitorSnapshot.item.alerts.length : 0}`
          : "no saved snapshot",
        `discord ${checkPass("discord-alert") ? "configured" : "optional"}`
      ],
      nextStep: "무료 플랜에서는 Vercel Cron 대신 GitHub Actions snapshot만 유지하고, 위험 alert만 Discord로 보내세요."
    }),
    scoreCapability({
      id: "learn",
      label: "운영 기억",
      passed: [
        tableOk("agent_memories"),
        hasTool("search_agent_memories"),
        hasTool("request_agent_memory"),
        checkPass("memory-learning"),
        (input.memorySuggestions?.length || 0) > 0
      ],
      evidence: [
        tableOk("agent_memories") ? "agent_memories reachable" : "agent_memories check missing",
        `memory suggestions ${input.memorySuggestions?.length || 0}`,
        checkPass("memory-learning") ? "learning loop gate pass" : "learning loop gate not pass"
      ],
      nextStep: "반복 장애가 보이면 Learning Suggestions에서 승인 기반 memory로 남겨 다음 진단에 재사용하세요."
    }),
    scoreCapability({
      id: "content",
      label: "콘텐츠 보조",
      passed: [
        hasTool("generate_content_draft"),
        hasTool("analyze_content_performance"),
        hasTool("request_content_post"),
        Boolean(input.contentPerformance)
      ],
      evidence: [
        input.contentPerformance
          ? `${input.contentPerformance.totalPosts || 0} posts, ${input.contentPerformance.totalViews || 0} views`
          : "content performance missing",
        hasTool("request_content_post") ? "post publish approval tool registered" : "post approval tool missing"
      ],
      nextStep: "주간 콘텐츠 추천은 성과 리포트와 승인 기반 발행을 연결해 운영 루틴으로 쓰세요."
    }),
    scoreCapability({
      id: "security",
      label: "보안/감사",
      passed: [
        checkPass("log-redaction"),
        checkOk("security:log-redaction"),
        checkOk("tools:safety-classification"),
        checkPass("dangerous-tools")
      ],
      evidence: [
        checkPass("log-redaction") ? "rollout redaction gate pass" : "rollout redaction gate not pass",
        checkOk("tools:safety-classification") ? "tool safety classification ok" : "tool safety classification not ok",
        checkPass("dangerous-tools") ? "dangerous boundary present" : "dangerous boundary missing"
      ],
      nextStep: "민감정보가 로그에 남지 않는지 self-test와 승인 결과 로그를 배포 전마다 확인하세요."
    }),
    scoreCapability({
      id: "free_plan",
      label: "무료 플랜 보호",
      passed: [
        checkPass("monitor-secret"),
        input.rollout?.status !== "fail",
        input.deploymentHealth?.severity !== "critical",
        Boolean(input.todayActionBoard)
      ],
      evidence: [
        "Vercel Cron 추가 없이 GitHub Actions snapshot 사용",
        `rollout ${input.rollout?.status || "unknown"}`,
        `deployment ${input.deploymentHealth?.severity || "unknown"}`
      ],
      nextStep: "긴 작업은 GitHub Actions에 남기고 Agent는 관찰, 승인 영향 분석, 짧은 알림에 집중시키세요."
    })
  ];

  const score = Math.round(items.reduce((sum, item) => sum + item.score, 0) / Math.max(items.length, 1));
  const label = getMatrixLabel(score, items);
  const blockers = items.filter((item) => item.status === "blocked");
  const partials = items.filter((item) => item.status === "partial");

  return {
    generatedAt: new Date().toISOString(),
    score,
    label,
    summary: blockers.length
      ? `${blockers.length}개 핵심 능력이 막혀 있습니다. ${blockers[0].label}부터 확인하세요.`
      : partials.length
        ? `${partials.length}개 능력은 동작하지만 보강 여지가 있습니다.`
        : "운영 관찰, 승인, 감시, 학습 루프가 모두 안정권입니다.",
    items
  };
}

function scoreCapability(input: {
  id: AgentCapabilityMatrixItem["id"];
  label: string;
  passed: boolean[];
  evidence: string[];
  nextStep: string;
}): AgentCapabilityMatrixItem {
  const total = Math.max(input.passed.length, 1);
  const passedCount = input.passed.filter(Boolean).length;
  const score = Math.round((passedCount / total) * 100);
  return {
    id: input.id,
    label: input.label,
    status: score >= 80 ? "ready" : score >= 50 ? "partial" : "blocked",
    score,
    evidence: input.evidence,
    nextStep: input.nextStep
  };
}

function getMatrixLabel(score: number, items: AgentCapabilityMatrixItem[]) {
  if (items.some((item) => item.status === "blocked")) return "at_risk" as const;
  if (score >= 90) return "excellent" as const;
  if (score >= 75) return "stable" as const;
  if (score >= 55) return "needs_attention" as const;
  return "at_risk" as const;
}
