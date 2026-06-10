export type AgentPlaybook = {
  id: string;
  title: string;
  severity: "ok" | "warn" | "critical";
  trigger: string;
  nextAction: string;
  riskLevel: "read" | "approval_required" | "manual_check";
};

type AlertLike = {
  type?: string;
  severity?: "ok" | "warn" | "critical";
  message?: string;
};

const PLAYBOOKS: Record<string, Omit<AgentPlaybook, "severity">> = {
  api_errors: {
    id: "pubg-api-degradation",
    title: "PUBG API 장애/저하 대응",
    trigger: "최근 PUBG API 에러가 감지될 때",
    nextAction: "route/status/message별 빈도를 확인하고 429면 재분석/스크래핑을 보류, 5xx면 외부 API 상태와 최근 요청량을 비교합니다.",
    riskLevel: "read"
  },
  ai_cost: {
    id: "ai-cost-spike",
    title: "AI 비용 급증 대응",
    trigger: "최근 24시간 AI 비용이 임계치를 넘을 때",
    nextAction: "model_name/analysis_type별 비용을 비교하고 고비용 분석을 줄이거나 캐시 적중률을 점검합니다.",
    riskLevel: "read"
  },
  pending_approvals: {
    id: "approval-queue-review",
    title: "승인 대기열 검토",
    trigger: "위험 작업 승인 요청이 쌓일 때",
    nextAction: "/admin/bot 승인 패널에서 impact와 payload를 확인하고 필요한 작업만 승인합니다.",
    riskLevel: "approval_required"
  },
  approval_gate_block: {
    id: "approval-gate-block",
    title: "Execution Gate 차단 요청 대응",
    trigger: "승인 요청에 필수 대상값 누락 또는 실행 차단 사유가 있을 때",
    nextAction: "/admin/bot 승인 상세에서 Execution Gate 사유를 확인하고, 대상 match/player/title/body 등을 채운 새 요청을 만들기 전까지 승인하지 않습니다.",
    riskLevel: "approval_required"
  },
  pubg_quota: {
    id: "pubg-quota-protection",
    title: "PUBG API quota 보호",
    trigger: "PUBG API remaining 값이 낮을 때",
    nextAction: "긴 수집 작업과 강제 재분석을 보류하고, 캐시 재사용이 가능한 요청 위주로 운영합니다.",
    riskLevel: "manual_check"
  },
  monitor_failed: {
    id: "agent-monitor-failure",
    title: "Agent Monitor 실패 대응",
    trigger: "운영 점검 API 자체가 실패할 때",
    nextAction: "최근 agent_runs error와 Vercel runtime log를 확인하고 Supabase service role/env 누락 여부를 점검합니다.",
    riskLevel: "manual_check"
  },
  deployment_failure: {
    id: "vercel-deployment-failure",
    title: "Vercel 배포 실패 대응",
    trigger: "최근 Vercel 배포가 실패했거나 배포 상태 조회가 불안정할 때",
    nextAction: "get_vercel_deployments로 실패 배포 ID를 확인한 뒤 get_vercel_build_logs로 에러 로그를 요약하고, 필요하면 GitHub Actions 마지막 실행과 env 변경 이력을 비교합니다.",
    riskLevel: "read"
  }
};

export function matchPlaybooks(alerts: AlertLike[] = []): AgentPlaybook[] {
  return alerts
    .map((alert) => {
      const base = alert.type ? PLAYBOOKS[alert.type] : null;
      if (!base) return null;
      return {
        ...base,
        severity: alert.severity || "warn"
      };
    })
    .filter(Boolean) as AgentPlaybook[];
}

export function defaultPlaybooks(): AgentPlaybook[] {
  return Object.values(PLAYBOOKS).map((playbook) => ({
    ...playbook,
    severity: "ok"
  }));
}
