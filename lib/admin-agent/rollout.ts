import { fetchApprovalQueueSummary } from "./approvals";
import { fetchVercelDeploymentHealth } from "./deployments";
import type { AgentSelfTest } from "./self-test";
import { runAgentSelfTest } from "./self-test";
import { buildAgentToolCatalog } from "./tool-catalog";

export type RolloutCheckStatus = "pass" | "warn" | "fail";

export type RolloutChecklistItem = {
  id: string;
  label: string;
  status: RolloutCheckStatus;
  message: string;
  action: string;
};

export type AgentRolloutReadiness = {
  generatedAt: string;
  status: RolloutCheckStatus;
  checks: RolloutChecklistItem[];
  selfTest: AgentSelfTest;
};

export async function buildAgentRolloutReadiness(supabase: any): Promise<AgentRolloutReadiness> {
  const [selfTest, approvals, latestRun, deploymentHealth] = await Promise.all([
    runAgentSelfTest(supabase),
    fetchApprovalQueueSummary(supabase),
    fetchLatestRun(supabase),
    fetchVercelDeploymentHealth()
  ]);
  const catalog = buildAgentToolCatalog();
  const redactionCheck = selfTest.checks.find((check) => check.id === "security:log-redaction");
  const actionBoardCheck = selfTest.checks.find((check) => check.id === "workflow:today-action-board");
  const memoryLearningCheck = selfTest.checks.find((check) => check.id === "workflow:memory-learning");

  const checks: RolloutChecklistItem[] = [
    {
      id: "self-test",
      label: "에이전트 자체 점검",
      status: selfTest.status === "critical" ? "fail" : selfTest.status === "warn" ? "warn" : "pass",
      message: `위험 ${selfTest.checks.filter((check) => check.status === "critical").length}건, 주의 ${selfTest.checks.filter((check) => check.status === "warn").length}건`,
      action: "에이전트 준비 상태에서 위험 항목을 먼저 해결하세요."
    },
    {
      id: "dangerous-tools",
      label: "위험 도구 승인 경계",
      status: catalog.counts.dangerous > 0 ? "pass" : "fail",
      message: `위험 도구 ${catalog.counts.dangerous}개 등록됨`,
      action: "삭제/발행/저장 계열 도구가 approval_required로 분류되어 있는지 확인하세요."
    },
    {
      id: "log-redaction",
      label: "에이전트 로그 민감정보 제거",
      status: redactionCheck?.status === "critical" ? "fail" : "pass",
      message: redactionCheck?.message || "민감정보 제거 자체 점검 결과 없음",
      action: "민감정보 제거가 실패하면 실행/단계/승인 로그 저장을 중단하고 민감정보 패턴을 보강하세요."
    },
    {
      id: "pending-approvals",
      label: "승인 대기열",
      status: approvals.staleCount > 0 ? "warn" : "pass",
      message: `대기 ${approvals.count}건, 고위험 ${approvals.highRiskCount}건, 오래됨 ${approvals.staleCount}건`,
      action: "오래된 승인과 고위험 승인을 먼저 검토하세요."
    },
    {
      id: "action-board",
      label: "오늘 액션 보드",
      status: actionBoardCheck?.status === "critical" ? "fail" : "pass",
      message: actionBoardCheck?.message || "액션 보드 자체 점검 결과 없음",
      action: "액션 보드가 실패하면 /admin/bot 운영보드와 컨텍스트 묶음 연결을 확인하세요."
    },
    {
      id: "memory-learning",
      label: "운영 기억 학습 흐름",
      status: memoryLearningCheck?.status === "critical" ? "fail" : "pass",
      message: memoryLearningCheck?.message || "운영 기억 학습 자체 점검 결과 없음",
      action: "기억 후보 생성이 실패하면 기억 후보 빌더와 승인 기반 저장 프롬프트를 확인하세요."
    },
    {
      id: "monitor-secret",
      label: "점검 호출 비밀키",
      status: process.env.ADMIN_AGENT_CRON_SECRET || process.env.CRON_SECRET ? "pass" : "fail",
      message: process.env.ADMIN_AGENT_CRON_SECRET || process.env.CRON_SECRET ? "설정됨" : "필수 비밀키 누락",
      action: "GitHub Actions snapshot용 ADMIN_AGENT_CRON_SECRET 또는 CRON_SECRET을 설정하세요."
    },
    {
      id: "discord-alert",
      label: "Discord 알림",
      status: process.env.DISCORD_WEBHOOK_URL ? "pass" : "warn",
      message: process.env.DISCORD_WEBHOOK_URL ? "설정됨" : "선택 웹훅 미설정",
      action: "위험 알림을 Discord로 받고 싶다면 DISCORD_WEBHOOK_URL을 설정하세요."
    },
    {
      id: "latest-run",
      label: "최근 에이전트 실행",
      status: latestRun?.status === "failed" ? "warn" : "pass",
      message: latestRun ? `${statusLabel(latestRun.status)}: ${latestRun.message}` : "아직 실행 기록 없음",
      action: "배포 후 /admin/bot에서 브리핑을 한 번 실행해 실행 로그를 남기세요."
    },
    {
      id: "deployment-health",
      label: "배포 상태",
      status: deploymentHealth.severity === "critical" ? "fail" : deploymentHealth.severity === "warn" ? "warn" : "pass",
      message: deploymentHealth.message,
      action: "Vercel env가 설정되어 있다면 최근 배포 실패를 먼저 해결하세요."
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    status: getOverallStatus(checks),
    checks,
    selfTest
  };
}

async function fetchLatestRun(supabase: any) {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("id, status, message, started_at")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data || null;
}

function getOverallStatus(checks: RolloutChecklistItem[]): RolloutCheckStatus {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "pass";
}

function statusLabel(status?: string) {
  const map: Record<string, string> = {
    completed: "완료",
    failed: "실패",
    running: "실행 중",
    pending: "대기",
    ok: "정상",
    warn: "주의",
    critical: "위험",
    pass: "통과",
    fail: "실패"
  };
  return map[status || ""] || status || "미확인";
}
