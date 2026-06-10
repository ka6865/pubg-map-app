export type AgentMemorySuggestion = {
  id: string;
  priority: "low" | "medium" | "high";
  category: "incident" | "policy" | "operations" | "content";
  title: string;
  reason: string;
  prompt: string;
  tags: string[];
  evidence: string[];
};

export function buildMemorySuggestions(input: {
  apiErrors: { total: number; latest?: any[] };
  aiUsage: { totalCostUsd: number };
  pendingApprovals: { count: number; highRiskCount?: number; staleCount?: number };
  approvalGateSummary?: { blockCount?: number; items?: Array<{ title?: string; actionType?: string; gate?: { reasons?: string[] } }> };
  failedRuns: { count: number };
  deploymentHealth?: { severity?: "ok" | "warn" | "critical"; message?: string };
  memories?: { items?: any[] };
}) {
  const suggestions: AgentMemorySuggestion[] = [];
  const memoryText = (input.memories?.items || [])
    .map((memory) => `${memory.title || ""} ${memory.body || ""} ${(memory.metadata?.tags || []).join(" ")}`)
    .join(" ")
    .toLowerCase();

  if (input.apiErrors.total > 0 && !hasAny(memoryText, ["pubg", "api", "429", "quota"])) {
    const latest = input.apiErrors.latest?.[0];
    suggestions.push({
      id: "learn-pubg-api-incident",
      priority: input.apiErrors.total >= 3 ? "high" : "medium",
      category: "incident",
      title: "PUBG API 장애 대응 memory 저장",
      reason: `최근 PUBG API 에러 ${input.apiErrors.total}건이 있으나 관련 memory가 부족합니다.`,
      prompt: "최근 PUBG API 에러 대응 절차를 memory 저장 승인 요청으로 만들어줘",
      tags: ["pubg", "api", "incident", "quota"],
      evidence: [
        `apiErrors=${input.apiErrors.total}`,
        latest?.route ? `route=${latest.route}` : "route=unknown",
        latest?.status ? `status=${latest.status}` : "status=unknown"
      ]
    });
  }

  if ((input.approvalGateSummary?.blockCount || 0) > 0 && !hasAny(memoryText, ["execution gate", "approval gate", "승인", "gate"])) {
    const blocked = input.approvalGateSummary?.items?.find((item) => item.gate?.reasons?.length);
    suggestions.push({
      id: "learn-approval-gate-policy",
      priority: "high",
      category: "policy",
      title: "Execution Gate 승인 정책 memory 저장",
      reason: `Execution Gate block ${input.approvalGateSummary?.blockCount || 0}건이 있어 승인 재생성 기준을 남길 가치가 있습니다.`,
      prompt: "Execution Gate block 승인 요청 처리 기준을 policy memory 저장 승인 요청으로 만들어줘",
      tags: ["approval", "execution-gate", "policy"],
      evidence: [
        `blockCount=${input.approvalGateSummary?.blockCount || 0}`,
        blocked?.actionType ? `action=${blocked.actionType}` : "action=unknown",
        blocked?.gate?.reasons?.[0] ? `reason=${blocked.gate.reasons[0]}` : "reason=unknown"
      ]
    });
  }

  if (input.failedRuns.count > 0 && !hasAny(memoryText, ["agent run", "failed run", "실패 run"])) {
    suggestions.push({
      id: "learn-agent-run-failure",
      priority: "high",
      category: "incident",
      title: "Agent run 실패 대응 memory 저장",
      reason: `최근 실패한 agent run ${input.failedRuns.count}건이 있습니다.`,
      prompt: "최근 실패한 agent run 원인과 재발 방지책을 memory 저장 승인 요청으로 만들어줘",
      tags: ["agent", "run", "failure", "incident"],
      evidence: [`failedRuns=${input.failedRuns.count}`]
    });
  }

  if (input.aiUsage.totalCostUsd > 0 && !hasAny(memoryText, ["ai cost", "token", "비용", "토큰"])) {
    suggestions.push({
      id: "learn-ai-cost-policy",
      priority: "medium",
      category: "operations",
      title: "AI 비용 운영 기준 memory 저장",
      reason: `최근 AI 비용 $${input.aiUsage.totalCostUsd.toFixed(4)} 신호가 있습니다.`,
      prompt: "AI 비용이 튈 때 확인할 운영 기준을 memory 저장 승인 요청으로 만들어줘",
      tags: ["ai", "cost", "token", "operations"],
      evidence: [`aiCost=${input.aiUsage.totalCostUsd.toFixed(6)}`]
    });
  }

  if (input.deploymentHealth?.severity && input.deploymentHealth.severity !== "ok" && !hasAny(memoryText, ["vercel", "deploy", "deployment", "배포"])) {
    suggestions.push({
      id: "learn-deployment-failure",
      priority: input.deploymentHealth.severity === "critical" ? "high" : "medium",
      category: "incident",
      title: "배포 실패 대응 memory 저장",
      reason: input.deploymentHealth.message || `배포 상태가 ${input.deploymentHealth.severity}입니다.`,
      prompt: "최근 Vercel 배포 실패 대응 절차를 memory 저장 승인 요청으로 만들어줘",
      tags: ["vercel", "deployment", "build", "incident"],
      evidence: [`deployment=${input.deploymentHealth.severity}`, input.deploymentHealth.message || "message=unknown"]
    });
  }

  if (!suggestions.length && !(input.memories?.items || []).length) {
    suggestions.push({
      id: "seed-operations-memory",
      priority: "low",
      category: "operations",
      title: "운영 memory seed 저장",
      reason: "활성 memory가 없어 반복 이슈 인식 품질이 낮습니다.",
      prompt: "BGMS 기본 운영 정책을 memory 저장 승인 요청으로 만들어줘",
      tags: ["operations", "policy", "seed"],
      evidence: ["activeMemories=0"]
    });
  }

  return suggestions.sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority)).slice(0, 4);
}

function hasAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle.toLowerCase()));
}

function priorityWeight(priority: AgentMemorySuggestion["priority"]) {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}
