import { fetchApprovalQueueSummary } from "@/lib/admin-agent/approvals";
import { buildTodayActionBoard } from "@/lib/admin-agent/action-board";
import { buildAgentApprovalAdvisor } from "@/lib/admin-agent/approval-advisor";
import { buildAgentAutomationContracts } from "@/lib/admin-agent/automation-contracts";
import { buildAgentDecisionTrace } from "@/lib/admin-agent/decision-trace";
import { buildAgentFinalReadiness } from "@/lib/admin-agent/final-readiness";
import { buildAgentGrowthRoadmap } from "@/lib/admin-agent/growth-roadmap";
import { buildAgentLaunchKit } from "@/lib/admin-agent/launch-kit";
import { buildAgentMissionControl } from "@/lib/admin-agent/mission-control";
import { buildAgentMonitorTrend } from "@/lib/admin-agent/monitor-trend";
import { buildAgentOperatingSop } from "@/lib/admin-agent/operating-sop";
import { buildAgentOwnerInbox } from "@/lib/admin-agent/owner-inbox";
import { buildAgentOperatorCoach } from "@/lib/admin-agent/operator-coach";
import { buildOperatorValueScorecard } from "@/lib/admin-agent/operator-value";
import { buildAgentOutcomeReview } from "@/lib/admin-agent/outcome-review";
import { buildAgentOwnerBrief } from "@/lib/admin-agent/owner-brief";
import { buildAgentRiskRadar } from "@/lib/admin-agent/risk-radar";
import { buildAgentSafetyAudit } from "@/lib/admin-agent/safety-audit";
import { getAgentThresholds } from "@/lib/admin-agent/thresholds";

type ContextQueryResult<T> = {
  value: T;
  error?: string;
};

export async function buildAdminAgentContextPack(supabase: any) {
  const thresholds = getAgentThresholds();
  const [approvals, recentRuns, latestMonitor, monitorTrend, memories, latestReport] = await Promise.all([
    safeContextQuery(() => fetchApprovalQueueSummary(supabase, 5), null),
    safeContextQuery(() => fetchRecentRuns(supabase), []),
    safeContextQuery(() => fetchLatestMonitorSnapshot(supabase), null),
    safeContextQuery(() => fetchRecentMonitorTrend(supabase), buildAgentMonitorTrend([])),
    safeContextQuery(() => fetchRecentMemories(supabase), []),
    safeContextQuery(() => fetchLatestReport(supabase), null)
  ]);
  const actionBoard = latestMonitor.value
    ? buildTodayActionBoard({
      dailyCheckout: latestMonitor.value.dailyCheckout,
      nextActions: latestMonitor.value.nextActions || [],
      approvalGateSummary: latestMonitor.value.approvalGateSummary,
      pendingApprovals: approvals.value || undefined,
      latestReport: latestReport.value ? { item: latestReport.value } : undefined
    })
    : null;
  const pendingApprovals = approvals.value || {
    count: 0,
    highRiskCount: 0,
    staleCount: 0,
    oldestAgeHours: 0,
    oldest: null,
    items: []
  };
  const recentActivity = summarizeRecentActivity(recentRuns.value || []);
  const latestMonitorSnapshot = latestMonitor.value ? { item: latestMonitor.value } : { item: null };
  const operatorValue = buildOperatorValueScorecard({
    recentAgentActivity: recentActivity,
    approvalOutcomes: { executed: 0, rejected: 0, failed: 0 },
    pendingApprovals,
    approvalGateSummary: latestMonitor.value?.approvalGateSummary,
    latestMonitorSnapshot,
    todayActionBoard: actionBoard,
    relatedMemories: { items: memories.value || [] }
  });
  const growthRoadmap = buildAgentGrowthRoadmap({
    severity: latestMonitor.value?.severity || (pendingApprovals.count > 0 ? "warn" : "ok"),
    dailyCheckout: latestMonitor.value?.dailyCheckout,
    todayActionBoard: actionBoard,
    nextActions: latestMonitor.value?.nextActions || [],
    operatorValue,
    approvalGateSummary: latestMonitor.value?.approvalGateSummary,
    pendingApprovals
  });
  const ownerBrief = buildAgentOwnerBrief({
    severity: latestMonitor.value?.severity || (pendingApprovals.count > 0 ? "warn" : "ok"),
    dailyCheckout: latestMonitor.value?.dailyCheckout,
    todayActionBoard: actionBoard,
    growthRoadmap,
    operatorValue,
    pendingApprovals,
    approvalGateSummary: latestMonitor.value?.approvalGateSummary,
    latestMonitorSnapshot
  });
  const automationContracts = buildAgentAutomationContracts({
    pendingApprovals,
    monitorSeverity: latestMonitor.value?.severity || (pendingApprovals.count > 0 ? "warn" : "ok"),
    discordConfigured: Boolean(process.env.DISCORD_WEBHOOK_URL)
  });
  const operatingSop = buildAgentOperatingSop({
    severity: latestMonitor.value?.severity || (pendingApprovals.count > 0 ? "warn" : "ok"),
    dailyCheckout: latestMonitor.value?.dailyCheckout,
    todayActionBoard: actionBoard,
    nextActions: latestMonitor.value?.nextActions || [],
    pendingApprovals,
    approvalGateSummary: latestMonitor.value?.approvalGateSummary,
    monitorTrend: monitorTrend.value
  });
  const riskRadar = buildAgentRiskRadar({
    severity: latestMonitor.value?.severity || (pendingApprovals.count > 0 ? "warn" : "ok"),
    pendingApprovals,
    approvalGateSummary: latestMonitor.value?.approvalGateSummary,
    monitorTrend: monitorTrend.value,
    dailyCheckout: latestMonitor.value?.dailyCheckout
  });
  const decisionTrace = buildAgentDecisionTrace({
    severity: latestMonitor.value?.severity || (pendingApprovals.count > 0 ? "warn" : "ok"),
    ownerBrief,
    dailyCheckout: latestMonitor.value?.dailyCheckout,
    todayActionBoard: actionBoard,
    riskRadar,
    operatingSop,
    pendingApprovals,
    approvalGateSummary: latestMonitor.value?.approvalGateSummary,
    latestMonitorSnapshot,
    monitorTrend: monitorTrend.value,
    memories,
    latestReport
  });
  const safetyAudit = buildAgentSafetyAudit({
    readiness: { status: "ok", checks: [] },
    toolCatalog: undefined,
    approvalGateSummary: latestMonitor.value?.approvalGateSummary,
    automationContracts,
    riskRadar,
    decisionTrace,
    pendingApprovals,
    latestMonitorSnapshot
  });
  const approvalAdvisor = buildAgentApprovalAdvisor({
    pendingApprovals,
    approvalGateSummary: latestMonitor.value?.approvalGateSummary,
    safetyAudit,
    riskRadar
  });
  const missionControl = buildAgentMissionControl({
    severity: latestMonitor.value?.severity || (pendingApprovals.count > 0 ? "warn" : "ok"),
    ownerBrief,
    todayActionBoard: actionBoard,
    approvalAdvisor,
    operatingSop,
    riskRadar,
    safetyAudit,
    dailyCheckout: latestMonitor.value?.dailyCheckout,
    nextActions: latestMonitor.value?.nextActions || [],
    latestReport: latestReport.value ? { item: latestReport.value } : undefined
  });
  const ownerInbox = buildAgentOwnerInbox({
    ownerBrief,
    missionControl,
    approvalAdvisor,
    safetyAudit,
    riskRadar,
    operatingSop,
    growthRoadmap,
    operatorValue,
    pendingApprovals
  });
  const outcomeReview = buildAgentOutcomeReview({
    recentAgentActivity: recentActivity,
    approvalOutcomes: { executed: 0, rejected: 0, failed: 0 },
    pendingApprovals,
    approvalGateSummary: latestMonitor.value?.approvalGateSummary,
    failedRuns: { count: recentActivity.failedRuns },
    apiErrors: { total: 0 },
    aiUsage: { totalRequests: 0, totalCostUsd: 0 },
    latestMonitorSnapshot,
    monitorTrend: monitorTrend.value,
    dailyCheckout: latestMonitor.value?.dailyCheckout,
    missionControl,
    ownerInbox
  });
  const operatorCoach = buildAgentOperatorCoach({
    severity: latestMonitor.value?.severity || (pendingApprovals.count > 0 ? "warn" : "ok"),
    outcomeReview,
    ownerInbox,
    missionControl,
    dailyCheckout: latestMonitor.value?.dailyCheckout,
    growthRoadmap,
    operatorValue
  });
  const launchKit = buildAgentLaunchKit({
    readiness: { status: "ok", checks: [] },
    automationContracts,
    safetyAudit,
    operatorCoach,
    outcomeReview,
    ownerInbox,
    missionControl,
    approvalAdvisor,
    monitorTrend: monitorTrend.value
  });
  const finalReadiness = buildAgentFinalReadiness({
    readiness: { status: "ok", checks: [] },
    automationContracts,
    safetyAudit,
    approvalAdvisor,
    missionControl,
    ownerInbox,
    outcomeReview,
    operatorCoach,
    launchKit,
    monitorTrend: monitorTrend.value,
    pendingApprovals,
    approvalGateSummary: latestMonitor.value?.approvalGateSummary
  });

  const lines = [
    "Current server context snapshot:",
    "Use this as a starting point only. For precise or fresh numbers, call the appropriate read-only tool.",
    `- Monitor window: ${thresholds.windowHours}h`,
    `- Approval queue: ${approvals.value?.count ?? 0} pending, ${approvals.value?.highRiskCount ?? 0} high risk, ${approvals.value?.staleCount ?? 0} stale`,
    `- Approval stale threshold: ${thresholds.approvalStaleHours}h`
  ];

  if (latestMonitor.value) {
    const monitor = latestMonitor.value;
    const alertCount = Array.isArray(monitor.alerts) ? monitor.alerts.length : 0;
    const gateBlock = Number(monitor.approvalGateSummary?.blockCount || 0);
    lines.push(`- Latest monitor: ${monitor.severity || "unknown"}, alerts ${alertCount}, gate block ${gateBlock}`);
    if (monitor.dailyCheckout) {
      lines.push(`- Daily checkout: ${monitor.dailyCheckout.label || monitor.dailyCheckout.status} (${monitor.dailyCheckout.score ?? 0}/100) - ${truncateText(monitor.dailyCheckout.summary, 160)}`);
    }
  }
  lines.push(`- Monitor trend: ${monitorTrend.value.label} (${monitorTrend.value.sampleSize} samples) - ${truncateText(monitorTrend.value.summary, 160)}`);
  lines.push(`- Monitor trend recommendation: ${truncateText(monitorTrend.value.recommendation, 160)}`);

  lines.push(`- Owner brief: ${ownerBrief.status} / ${truncateText(ownerBrief.headline, 180)}`);
  lines.push(`- Owner do now: ${ownerBrief.doNow.title} / ${ownerBrief.doNow.prompt}`);
  if (ownerBrief.needsOwnerReview.length) {
    lines.push("- Owner review items:");
    ownerBrief.needsOwnerReview.slice(0, 3).forEach((item) => {
      lines.push(`  - ${item.title}: ${item.reason} (${item.location})`);
    });
  }
  lines.push(`- Operator value: ${operatorValue.score}/100 (${operatorValue.label}) - ${truncateText(operatorValue.summary, 180)}`);
  if (operatorValue.nextLeverage[0]) {
    lines.push(`- Operator next leverage: ${operatorValue.nextLeverage[0].title} / ${operatorValue.nextLeverage[0].prompt}`);
  }
  lines.push(`- Growth roadmap: ${growthRoadmap.status} - ${truncateText(growthRoadmap.summary, 180)}`);
  lines.push(`- Growth primary prompt: ${growthRoadmap.primaryPrompt}`);
  lines.push(`- Automation contract: ${automationContracts.summary}`);
  lines.push(`- Free-plan guardrails: ${automationContracts.guardrails.slice(0, 2).join(" / ")}`);
  automationContracts.contracts.slice(0, 4).forEach((contract) => {
    lines.push(`  - ${contract.title}: ${contract.status}, ${contract.risk}, ${contract.whereToCheck}`);
  });
  lines.push(`- Operating SOP: ${operatingSop.status} / ${truncateText(operatingSop.title, 160)}`);
  lines.push(`- SOP primary prompt: ${operatingSop.primaryPrompt}`);
  operatingSop.procedures.slice(0, 3).forEach((procedure) => {
    lines.push(`  - ${procedure.title}: ${procedure.severity}, ${procedure.risk}, ${procedure.nextPrompt}`);
  });
  lines.push(`- Risk radar: ${riskRadar.status} / ${riskRadar.score}/100 - ${truncateText(riskRadar.summary, 180)}`);
  lines.push(`- Risk primary prompt: ${riskRadar.primaryPrompt}`);
  riskRadar.items.slice(0, 3).forEach((risk) => {
    lines.push(`  - ${risk.title}: ${risk.severity}, score ${risk.score}, ${risk.prompt}`);
  });
  lines.push(`- Decision trace: ${decisionTrace.confidence} - ${truncateText(decisionTrace.summary, 180)}`);
  decisionTrace.decisions.slice(0, 3).forEach((decision) => {
    lines.push(`  - ${decision.title}: ${decision.confidence}, ${decision.prompt}`);
  });
  if (decisionTrace.blindSpots.length) {
    lines.push(`- Decision blind spots: ${decisionTrace.blindSpots.slice(0, 2).join(" / ")}`);
  }
  lines.push(`- Safety audit: ${safetyAudit.status} / ${safetyAudit.score}/100 - ${truncateText(safetyAudit.summary, 180)}`);
  safetyAudit.invariants.filter((item) => item.status !== "ok").slice(0, 3).forEach((item) => {
    lines.push(`  - ${item.label}: ${item.status}, ${item.action}`);
  });
  lines.push(`- Approval advisor: ${approvalAdvisor.status} - ${truncateText(approvalAdvisor.summary, 180)}`);
  approvalAdvisor.items.slice(0, 3).forEach((item) => {
    lines.push(`  - ${item.decision}/${item.priority}: ${item.title} / ${item.prompt}`);
  });
  lines.push(`- Mission control: ${missionControl.status} - ${truncateText(missionControl.summary, 180)}`);
  lines.push(`- Mission first command: ${missionControl.firstCommand}`);
  missionControl.items.slice(0, 3).forEach((item) => {
    lines.push(`  - ${item.phase}/${item.priority}: ${item.title} / ${item.command}`);
  });
  lines.push(`- Owner inbox: ${ownerInbox.status} - ${truncateText(ownerInbox.summary, 180)}`);
  lines.push(`- Owner inbox primary action: ${ownerInbox.primaryAction}`);
  (["decide", "approve", "delegate", "watch"] as const).forEach((lane) => {
    const item = ownerInbox.lanes[lane][0];
    if (item) lines.push(`  - ${lane}/${item.priority}: ${item.title} / ${item.action}`);
  });
  lines.push(`- Outcome review: ${outcomeReview.status} / ${outcomeReview.score}/100 - ${truncateText(outcomeReview.summary, 180)}`);
  lines.push(`- Outcome primary prompt: ${outcomeReview.primaryPrompt}`);
  outcomeReview.items.slice(0, 3).forEach((item) => {
    lines.push(`  - ${item.status}/${item.priority}: ${item.title} / ${item.prompt}`);
  });
  lines.push(`- Operator coach: ${operatorCoach.mode} - ${truncateText(operatorCoach.summary, 180)}`);
  lines.push(`- Operator coach top prompt: ${operatorCoach.topPrompt}`);
  operatorCoach.items.slice(0, 3).forEach((item) => {
    lines.push(`  - ${item.priority}: ${item.title} / ${item.prompt}`);
  });
  lines.push(`- Launch kit: ${launchKit.status} - ${truncateText(launchKit.summary, 180)}`);
  lines.push(`- Launch first prompt: ${launchKit.firstPrompt}`);
  launchKit.routines.slice(0, 4).forEach((routine) => {
    lines.push(`  - ${routine.cadence}/${routine.owner}: ${routine.title} / ${routine.steps[0]?.prompt || routine.steps[0]?.label}`);
  });
  lines.push(`- Final readiness: ${finalReadiness.status} / ${finalReadiness.score}/100 - ${truncateText(finalReadiness.summary, 180)}`);
  finalReadiness.items.slice(0, 4).forEach((item) => {
    lines.push(`  - ${item.status}/${item.score}: ${item.title} / ${item.gap}`);
  });

  if (actionBoard) {
    lines.push(`- Today action board: ${actionBoard.status} - ${truncateText(actionBoard.summary, 180)}`);
    lines.push(`- Today primary prompt: ${actionBoard.primaryPrompt}`);
    const topBoardItems = [
      ...actionBoard.lanes.doNow.slice(0, 2).map((item) => `do now/${item.priority}/${item.score}: ${item.title}`),
      ...actionBoard.lanes.review.slice(0, 1).map((item) => `review/${item.priority}/${item.score}: ${item.title}`),
      ...actionBoard.lanes.watch.slice(0, 1).map((item) => `watch/${item.priority}/${item.score}: ${item.title}`),
      ...actionBoard.lanes.save.slice(0, 1).map((item) => `save/${item.priority}/${item.score}: ${item.title}`)
    ];
    if (topBoardItems.length) {
      lines.push("- Today board lanes:");
      topBoardItems.forEach((item) => lines.push(`  - ${item}`));
    }
  }

  if (approvals.value?.items?.length) {
    lines.push("- Pending approval hints:");
    approvals.value.items.slice(0, 3).forEach((approval: any) => {
      const title = approval.payload?.title || approval.payload?.cleanupType || approval.action_type;
      const stale = approval.isStale ? ", stale" : "";
      lines.push(`  - ${approval.action_type}: ${title} (${approval.priority}${stale}, ${approval.ageHours}h old)`);
    });
  }

  if (recentRuns.value.length) {
    lines.push("- Recent agent runs:");
    recentRuns.value.slice(0, 3).forEach((run: any) => {
      const label = truncateText(run.summary || run.error || run.message, 120);
      lines.push(`  - ${run.status}: ${label}`);
    });
  }

  if (latestReport.value) {
    lines.push(`- Latest saved report: ${latestReport.value.title || "untitled"} (${formatDate(latestReport.value.updated_at)})`);
  }

  if (memories.value.length) {
    lines.push("- Recent active memories:");
    memories.value.slice(0, 4).forEach((memory: any) => {
      lines.push(`  - ${memory.title} (${memory.category})`);
    });
  }

  const errors = [approvals, recentRuns, latestMonitor, monitorTrend, memories, latestReport].flatMap((result) => result.error ? [result.error] : []);
  if (errors.length) {
    lines.push(`- Context query notes: ${errors.slice(0, 2).join(" / ")}`);
  }

  return lines.join("\n");
}

async function fetchLatestMonitorSnapshot(supabase: any) {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("summary, completed_at")
    .eq("status", "completed")
    .eq("system_prompt", "admin-agent-monitor")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const parsed = parseJson(data?.summary);
  if (!parsed) return null;
  return {
    ...parsed,
    completedAt: data?.completed_at || parsed.generatedAt || null
  };
}

async function fetchRecentMonitorTrend(supabase: any) {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("summary, completed_at")
    .eq("status", "completed")
    .eq("system_prompt", "admin-agent-monitor")
    .order("completed_at", { ascending: false })
    .limit(7);

  if (error) throw error;
  return buildAgentMonitorTrend(data || []);
}

async function safeContextQuery<T>(fn: () => Promise<T>, fallback: T): Promise<ContextQueryResult<T>> {
  try {
    return { value: await fn() };
  } catch (error: any) {
    return {
      value: fallback,
      error: error.message || String(error)
    };
  }
}

async function fetchRecentRuns(supabase: any) {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("status, system_prompt, message, summary, error, started_at")
    .order("started_at", { ascending: false })
    .limit(5);

  if (error) throw error;
  return data || [];
}

function summarizeRecentActivity(runs: any[]) {
  return {
    totalRuns: runs.length,
    completedRuns: runs.filter((run) => run.status === "completed").length,
    failedRuns: runs.filter((run) => run.status === "failed").length,
    monitorRuns: runs.filter((run) => run.system_prompt === "admin-agent-monitor" || String(run.message || "").includes("monitor")).length
  };
}

async function fetchRecentMemories(supabase: any) {
  const { data, error } = await supabase
    .from("agent_memories")
    .select("id, category, title, body, metadata, updated_at")
    .order("updated_at", { ascending: false })
    .limit(5);

  if (error) throw error;
  return (data || []).filter((memory: any) => memory.metadata?.active !== false);
}

async function fetchLatestReport(supabase: any) {
  const { data, error } = await supabase
    .from("agent_memories")
    .select("id, title, body, metadata, updated_at")
    .eq("category", "report")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (data?.metadata?.active === false) return null;
  return data || null;
}

function truncateText(value?: string | null, maxLength = 120) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "-";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}...`;
}

function parseJson(value?: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
