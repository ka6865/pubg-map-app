export type AgentThresholds = {
  windowHours: number;
  apiErrorsCritical: number;
  aiCostWarnUsd: number;
  aiCostCriticalUsd: number;
  pubgQuotaWarnRemaining: number;
  pubgQuotaCriticalRemaining: number;
  approvalStaleHours: number;
};

export function getAgentThresholds(): AgentThresholds {
  return {
    windowHours: numberEnv("ADMIN_AGENT_WINDOW_HOURS", 24),
    apiErrorsCritical: numberEnv("ADMIN_AGENT_API_ERRORS_CRITICAL", 10),
    aiCostWarnUsd: numberEnv("ADMIN_AGENT_AI_COST_WARN_USD", 1),
    aiCostCriticalUsd: numberEnv("ADMIN_AGENT_AI_COST_CRITICAL_USD", 5),
    pubgQuotaWarnRemaining: numberEnv("ADMIN_AGENT_PUBG_QUOTA_WARN", 3),
    pubgQuotaCriticalRemaining: numberEnv("ADMIN_AGENT_PUBG_QUOTA_CRITICAL", 1),
    approvalStaleHours: numberEnv("ADMIN_AGENT_APPROVAL_STALE_HOURS", 24)
  };
}

function numberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
