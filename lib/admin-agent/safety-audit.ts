export type AgentSafetyAuditStatus = "pass" | "watch" | "block";
export type AgentSafetyAuditSeverity = "ok" | "warn" | "critical";

export interface AgentSafetyAuditInvariant {
  id: string;
  label: string;
  status: AgentSafetyAuditSeverity;
  evidence: string;
  risk: string;
  action: string;
}

export interface AgentSafetyAudit {
  generatedAt: string;
  status: AgentSafetyAuditStatus;
  score: number;
  summary: string;
  invariants: AgentSafetyAuditInvariant[];
  requiredFixes: string[];
  recommendedChecks: string[];
  primaryPrompt: string;
}

export function buildAgentSafetyAudit(input: {
  readiness?: any;
  toolCatalog?: any;
  approvalGateSummary?: { blockCount?: number; reviewCount?: number; passCount?: number };
  automationContracts?: any;
  riskRadar?: any;
  decisionTrace?: any;
  pendingApprovals?: { count?: number; highRiskCount?: number; staleCount?: number };
  latestMonitorSnapshot?: { item?: any; error?: string };
  deploymentHealth?: { configured?: boolean; severity?: string };
}): AgentSafetyAudit {
  const invariants = buildInvariants(input);
  const criticalCount = invariants.filter((item) => item.status === "critical").length;
  const warnCount = invariants.filter((item) => item.status === "warn").length;
  const score = Math.max(0, 100 - criticalCount * 24 - warnCount * 9);
  const status: AgentSafetyAuditStatus = criticalCount > 0 ? "block" : warnCount > 0 ? "watch" : "pass";
  const requiredFixes = invariants
    .filter((item) => item.status === "critical")
    .map((item) => item.action);
  const recommendedChecks = invariants
    .filter((item) => item.status !== "ok")
    .map((item) => item.action)
    .concat([
      "승인 패널에서 고위험/오래된 요청을 먼저 확인합니다.",
      "Decision Trace blind spot이 있으면 해당 verify prompt를 먼저 실행합니다."
    ])
    .filter(Boolean)
    .slice(0, 6);

  return {
    generatedAt: new Date().toISOString(),
    status,
    score,
    summary: buildSummary(status, score, criticalCount, warnCount),
    invariants,
    requiredFixes,
    recommendedChecks,
    primaryPrompt: requiredFixes[0] || recommendedChecks[0] || "Admin Agent 준비 상태를 점검해줘"
  };
}

function buildInvariants(input: Parameters<typeof buildAgentSafetyAudit>[0]): AgentSafetyAuditInvariant[] {
  const checks = input.readiness?.checks || [];
  const toolCatalog = input.toolCatalog || { counts: {}, tools: [] };
  const dangerousTools = toolCatalog.tools?.filter((tool: any) => tool.safetyLevel === "dangerous") || [];
  const unsafeDangerous = dangerousTools.filter((tool: any) => !tool.approvalRequired);
  const adminApi = checks.find((check: any) => check.id === "workflow:agent-api-surface");
  const redaction = checks.find((check: any) => check.id === "security:log-redaction");
  const toolSafety = checks.find((check: any) => check.id === "tools:safety-classification");
  const approvalLoop = checks.find((check: any) => check.id === "workflow:approval-loop");
  const requiredEnvCritical = checks.filter((check: any) => String(check.id || "").startsWith("env:") && check.status === "critical");
  const requiredTablesCritical = checks.filter((check: any) => String(check.id || "").startsWith("table:agent_") && check.status === "critical");
  const freePlanGuardrail = input.automationContracts?.guardrails?.some((item: string) => item.includes("Vercel cron") || item.includes("GitHub Actions"));
  const discordContract = input.automationContracts?.contracts?.find((contract: any) => contract.id === "discord-alerts");
  const gateBlock = Number(input.approvalGateSummary?.blockCount || 0);
  const riskAct = input.riskRadar?.status === "act";
  const blindSpotCount = input.decisionTrace?.blindSpots?.filter((item: string) => !item.includes("큰 blind spot")).length || 0;
  const monitorError = input.latestMonitorSnapshot?.error;

  return [
    invariant({
      id: "admin-api-guard",
      label: "관리자 API 권한 잠금",
      status: adminApi?.status === "critical" || requiredEnvCritical.length ? "critical" : adminApi?.status === "warn" ? "warn" : "ok",
      evidence: adminApi?.message || "admin agent API surface가 self-test에 포함됩니다.",
      risk: "서버 admin role 검증이 약하면 운영 도구가 일반 사용자에게 노출될 수 있습니다.",
      action: "Admin Agent 준비 상태를 점검해줘"
    }),
    invariant({
      id: "required-tables",
      label: "에이전트 로그/승인 테이블 접근",
      status: requiredTablesCritical.length ? "critical" : "ok",
      evidence: requiredTablesCritical.length ? `${requiredTablesCritical.length} required agent tables unreachable` : "agent_runs/steps/approvals/memories reachable",
      risk: "로그/승인 테이블이 끊기면 실행 추적과 Human-in-the-loop가 무력화됩니다.",
      action: "Admin Agent 준비 상태를 점검해줘"
    }),
    invariant({
      id: "dangerous-tools-approval",
      label: "위험 도구 승인 강제",
      status: unsafeDangerous.length || approvalLoop?.status === "critical" ? "critical" : approvalLoop?.status === "warn" ? "warn" : "ok",
      evidence: unsafeDangerous.length
        ? `dangerous without approval: ${unsafeDangerous.map((tool: any) => tool.name).join(", ")}`
        : `${dangerousTools.length} dangerous tools require approval`,
      risk: "삭제/발행/저장 작업이 승인 없이 실행될 수 있습니다.",
      action: "승인 대기 작업을 impact 기준으로 검토해줘"
    }),
    invariant({
      id: "tool-classification",
      label: "도구 안전 등급 분류",
      status: toolSafety?.status === "critical" ? "critical" : toolSafety?.status === "warn" ? "warn" : "ok",
      evidence: toolSafety?.message || `read ${toolCatalog.counts?.read || 0}, write ${toolCatalog.counts?.write || 0}, dangerous ${toolCatalog.counts?.dangerous || 0}`,
      risk: "도구 등급이 틀리면 봇이 위험 작업을 조회성 작업처럼 다룰 수 있습니다.",
      action: "Admin Agent가 지금 할 수 있는 일과 부족한 능력을 점검해줘"
    }),
    invariant({
      id: "execution-gate",
      label: "Execution Gate 차단",
      status: gateBlock > 0 ? "critical" : Number(input.approvalGateSummary?.reviewCount || 0) > 0 ? "warn" : "ok",
      evidence: `pass ${Number(input.approvalGateSummary?.passCount || 0)}, review ${Number(input.approvalGateSummary?.reviewCount || 0)}, block ${gateBlock}`,
      risk: "필수 대상값이 없는 승인 요청을 실행하면 실패하거나 잘못된 대상을 건드릴 수 있습니다.",
      action: "승인 대기 작업을 impact 기준으로 검토해줘"
    }),
    invariant({
      id: "log-redaction",
      label: "로그 민감정보 마스킹",
      status: redaction?.status === "critical" ? "critical" : redaction?.status === "warn" ? "warn" : "ok",
      evidence: redaction?.message || "redaction self-test covered common secret/token/password patterns",
      risk: "agent_runs/steps/approval result에 secret이 남을 수 있습니다.",
      action: "Admin Agent 준비 상태를 점검해줘"
    }),
    invariant({
      id: "free-plan-guardrail",
      label: "무료 플랜 보호",
      status: freePlanGuardrail ? "ok" : "warn",
      evidence: freePlanGuardrail ? "Automation Contract keeps heavy work in GitHub Actions and avoids extra Vercel cron." : "free-plan guardrail evidence missing",
      risk: "긴 작업이 Vercel 함수로 몰리면 무료 플랜에서 timeout/cost 문제가 커집니다.",
      action: "현재 자동화 계약과 무료 플랜 guardrail을 요약해줘"
    }),
    invariant({
      id: "discord-alert-scope",
      label: "Discord 알림 범위",
      status: discordContract?.risk === "safe" || discordContract?.status === "active" || discordContract?.status === "ready" ? "ok" : "warn",
      evidence: discordContract ? `${discordContract.title}: ${discordContract.guardrail}` : "Discord contract not found",
      risk: "정상 상태까지 알림을 보내면 운영 피로도가 높아지고 중요한 장애 알림이 묻힙니다.",
      action: "현재 자동화 계약과 무료 플랜 guardrail을 요약해줘"
    }),
    invariant({
      id: "decision-blind-spots",
      label: "판단 blind spot",
      status: blindSpotCount >= 2 || monitorError ? "warn" : "ok",
      evidence: monitorError || `${blindSpotCount} decision blind spots`,
      risk: "근거가 부족한 상태에서 에이전트 추천을 그대로 따르면 잘못된 우선순위를 잡을 수 있습니다.",
      action: "에이전트가 왜 이렇게 판단했는지 Decision Trace로 근거를 보여줘"
    }),
    invariant({
      id: "risk-radar-watch",
      label: "선제 위험 감시",
      status: riskAct ? "warn" : "ok",
      evidence: `risk radar ${input.riskRadar?.status || "unknown"} (${Number(input.riskRadar?.score || 0)}/100)`,
      risk: "큰 위험이 감지된 상태에서 마감/발행을 먼저 진행할 수 있습니다.",
      action: "다음에 터질 수 있는 운영 위험을 Risk Radar로 예측해줘"
    })
  ];
}

function invariant(input: AgentSafetyAuditInvariant): AgentSafetyAuditInvariant {
  return input;
}

function buildSummary(status: AgentSafetyAuditStatus, score: number, criticalCount: number, warnCount: number) {
  if (status === "block") return `안전 감사 점수 ${score}/100. critical ${criticalCount}건을 먼저 해결하기 전에는 위험 승인을 보류하세요.`;
  if (status === "watch") return `안전 감사 점수 ${score}/100. warn ${warnCount}건을 확인하면 운영 자동화 경계가 더 단단해집니다.`;
  return `안전 감사 점수 ${score}/100. 승인 기반 실행, 로그 마스킹, 무료 플랜 guardrail이 정상 범위입니다.`;
}
