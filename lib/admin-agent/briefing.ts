import { matchPlaybooks } from "./playbooks";
import { getAgentThresholds } from "./thresholds";

export type AgentBriefing = {
  generatedAt: string;
  windowHours: number;
  severity: "ok" | "warn" | "critical";
  headline: string;
  metrics: {
    pendingApprovals: number;
    failedRuns: number;
    apiErrors: number;
    aiCostUsd: number;
    aiRequests: number;
  };
  alerts: Array<{ type: string; severity: "warn" | "critical"; message: string; value?: unknown }>;
  playbooks: ReturnType<typeof matchPlaybooks>;
  memories: Array<{ id: string; category: string; title: string; body: string; updated_at: string }>;
  nextActions: string[];
};

export async function buildAgentBriefing(supabase: any, windowHours = getAgentThresholds().windowHours): Promise<AgentBriefing> {
  const thresholds = getAgentThresholds();
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const [pendingApprovals, failedRuns, apiErrors, aiUsage, memories] = await Promise.all([
    countRows(supabase, "agent_approvals", "status", "pending"),
    countRows(supabase, "agent_runs", "status", "failed", since, "started_at"),
    fetchApiErrors(supabase, since),
    fetchAiUsage(supabase, since),
    fetchRecentMemories(supabase)
  ]);

  const alerts: AgentBriefing["alerts"] = [];
  if (apiErrors.total > 0) {
    alerts.push({
      type: "api_errors",
      severity: apiErrors.total >= thresholds.apiErrorsCritical ? "critical" : "warn",
      message: `PUBG API 에러 ${apiErrors.total}건`,
      value: apiErrors.byStatus
    });
  }
  if (aiUsage.totalCostUsd > thresholds.aiCostWarnUsd) {
    alerts.push({
      type: "ai_cost",
      severity: aiUsage.totalCostUsd > thresholds.aiCostCriticalUsd ? "critical" : "warn",
      message: `AI 비용 $${aiUsage.totalCostUsd}`,
      value: aiUsage.byModel
    });
  }
  if (pendingApprovals.count > 0) {
    alerts.push({
      type: "pending_approvals",
      severity: "warn",
      message: `승인 대기 ${pendingApprovals.count}건`,
      value: pendingApprovals.count
    });
  }
  if (failedRuns.count > 0) {
    alerts.push({
      type: "monitor_failed",
      severity: "critical",
      message: `최근 실패한 agent run ${failedRuns.count}건`,
      value: failedRuns.count
    });
  }

  const severity = alerts.some((alert) => alert.severity === "critical")
    ? "critical"
    : alerts.some((alert) => alert.severity === "warn")
      ? "warn"
      : "ok";
  const playbooks = matchPlaybooks(alerts);

  return {
    generatedAt: new Date().toISOString(),
    windowHours,
    severity,
    headline: buildHeadline(severity, alerts.length),
    metrics: {
      pendingApprovals: pendingApprovals.count,
      failedRuns: failedRuns.count,
      apiErrors: apiErrors.total,
      aiCostUsd: aiUsage.totalCostUsd,
      aiRequests: aiUsage.totalRequests
    },
    alerts,
    playbooks,
    memories,
    nextActions: buildNextActions(alerts)
  };
}

export function renderBriefingText(briefing: AgentBriefing) {
  const lines = [
    `[BGMS 운영 브리핑] ${briefing.headline}`,
    `- 기준: 최근 ${briefing.windowHours}시간`,
    `- 상태: ${briefing.severity}`,
    `- 승인 대기: ${briefing.metrics.pendingApprovals}건`,
    `- Agent 실패: ${briefing.metrics.failedRuns}건`,
    `- PUBG API 에러: ${briefing.metrics.apiErrors}건`,
    `- AI 비용: $${briefing.metrics.aiCostUsd} (${briefing.metrics.aiRequests} requests)`
  ];

  if (briefing.alerts.length) {
    lines.push("", "Alerts:");
    briefing.alerts.forEach((alert) => lines.push(`- [${alert.severity}] ${alert.message}`));
  }

  if (briefing.playbooks.length) {
    lines.push("", "Playbooks:");
    briefing.playbooks.forEach((playbook) => lines.push(`- ${playbook.title}: ${playbook.nextAction}`));
  }

  lines.push("", "Next Actions:");
  briefing.nextActions.forEach((action) => lines.push(`- ${action}`));

  return lines.join("\n");
}

async function countRows(supabase: any, table: string, column?: string, value?: string, since?: string, sinceColumn = "created_at") {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (column && value !== undefined) query = query.eq(column, value);
  if (since) query = query.gte(sinceColumn, since);

  const { count, error } = await query;
  if (error) return { count: 0, error: error.message };
  return { count: count || 0 };
}

async function fetchApiErrors(supabase: any, since: string) {
  const { data, error } = await supabase
    .from("pubg_api_errors")
    .select("route, status, message, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return { total: 0, byStatus: {}, error: error.message };
  const byStatus: Record<string, number> = {};
  (data || []).forEach((row: any) => {
    const key = String(row.status || "unknown");
    byStatus[key] = (byStatus[key] || 0) + 1;
  });
  return { total: data?.length || 0, byStatus };
}

async function fetchAiUsage(supabase: any, since: string) {
  const { data, error } = await supabase
    .from("ai_usage_logs")
    .select("cost_usd, model_name, analysis_type")
    .gte("created_at", since)
    .limit(500);

  if (error) return { totalRequests: 0, totalCostUsd: 0, byModel: {}, error: error.message };
  const byModel: Record<string, number> = {};
  const totalCostUsd = (data || []).reduce((sum: number, row: any) => {
    const cost = Number(row.cost_usd || 0);
    const model = row.model_name || "unknown";
    byModel[model] = Number(((byModel[model] || 0) + cost).toFixed(6));
    return sum + cost;
  }, 0);
  return { totalRequests: data?.length || 0, totalCostUsd: Number(totalCostUsd.toFixed(6)), byModel };
}

async function fetchRecentMemories(supabase: any) {
  const { data, error } = await supabase
    .from("agent_memories")
    .select("id, category, title, body, updated_at, metadata")
    .in("category", ["incident", "policy", "operations"])
    .order("updated_at", { ascending: false })
    .limit(5);

  if (error) return [];
  return (data || [])
    .filter((memory: any) => memory.metadata?.active !== false)
    .map((memory: any) => ({
      id: memory.id,
      category: memory.category,
      title: memory.title,
      body: memory.body,
      updated_at: memory.updated_at
    }));
}

function buildHeadline(severity: AgentBriefing["severity"], alertCount: number) {
  if (severity === "critical") return `즉시 확인 필요한 운영 이슈 ${alertCount}건`;
  if (severity === "warn") return `검토 필요한 운영 신호 ${alertCount}건`;
  return "운영 상태 정상 범위";
}

function buildNextActions(alerts: AgentBriefing["alerts"]) {
  if (!alerts.length) return ["특별 조치 없이 정기 모니터링을 유지합니다."];
  return alerts.map((alert) => {
    if (alert.type === "api_errors") return "PUBG API 에러를 route/status별로 확인하고 429면 수집량을 낮춥니다.";
    if (alert.type === "ai_cost") return "AI 비용 상위 model/analysis_type을 확인하고 캐시 가능한 요청을 줄입니다.";
    if (alert.type === "pending_approvals") return "/admin/bot 승인 패널에서 high risk 작업부터 impact를 검토합니다.";
    if (alert.type === "monitor_failed") return "최근 agent_runs error와 Vercel runtime log를 확인합니다.";
    return alert.message;
  });
}
