import type { AgentDeploymentHealth } from "@/types/admin-bot";
import type { getAgentThresholds } from "./thresholds";

export type AgentNextAction = {
  id: string;
  priority: "low" | "medium" | "high";
  category: "stability" | "approval" | "cost" | "deploy" | "content" | "readiness" | "report";
  urgencyScore: number;
  title: string;
  reason: string;
  prompt: string;
  expectedOutcome: string;
  checklist: string[];
};

type Thresholds = ReturnType<typeof getAgentThresholds>;

export function buildNextBestActions(input: {
  pendingApprovals: number;
  staleApprovals: number;
  highRiskApprovals: number;
  failedRuns: number;
  apiErrors: number;
  aiCost: number;
  readinessStatus?: "ok" | "warn" | "critical";
  rolloutStatus?: "pass" | "warn" | "fail";
  deploymentHealth?: AgentDeploymentHealth;
  contentRecommendations?: string[];
  thresholds: Thresholds;
}): AgentNextAction[] {
  const actions: AgentNextAction[] = [];

  if (input.readinessStatus && input.readinessStatus !== "ok") {
    actions.push({
      id: "inspect-agent-readiness",
      priority: input.readinessStatus === "critical" ? "high" : "medium",
      category: "readiness",
      urgencyScore: input.readinessStatus === "critical" ? 94 : 68,
      title: "Admin Agent 준비 상태 점검",
      reason: `Agent readiness가 ${input.readinessStatus} 상태입니다.`,
      prompt: "Admin Agent 준비 상태를 점검해줘",
      expectedOutcome: "필수 테이블, env 구성, tool registry, 승인 대기 수를 확인합니다.",
      checklist: [
        "critical self-test 항목을 먼저 확인",
        "필수 env와 agent 테이블 접근 가능 여부 확인",
        "수정 후 self-test를 다시 실행"
      ]
    });
  }

  if (input.rolloutStatus && input.rolloutStatus !== "pass") {
    actions.push({
      id: "review-rollout-readiness",
      priority: input.rolloutStatus === "fail" ? "high" : "medium",
      category: "readiness",
      urgencyScore: input.rolloutStatus === "fail" ? 90 : 62,
      title: "Rollout Readiness 확인",
      reason: `배포 준비 상태가 ${input.rolloutStatus}입니다.`,
      prompt: "Rollout Readiness를 기준으로 배포 전 확인해야 할 항목을 정리해줘",
      expectedOutcome: "self-test, approval queue, monitor secret, deployment gate를 점검합니다.",
      checklist: [
        "fail check가 배포 차단 요건인지 확인",
        "승인 대기 high/stale 항목 확인",
        "monitor secret과 deployment gate 확인"
      ]
    });
  }

  if (input.failedRuns > 0) {
    actions.push({
      id: "inspect-failed-agent-runs",
      priority: "high",
      category: "stability",
      urgencyScore: clampScore(76 + input.failedRuns * 6),
      title: "실패한 Agent Run 확인",
      reason: `최근 ${input.thresholds.windowHours}시간 실패 run ${input.failedRuns}건`,
      prompt: "최근 실패한 agent run 원인과 재발 방지 조치를 정리해줘",
      expectedOutcome: "실패 원인, 영향 범위, 다음 조치가 정리됩니다.",
      checklist: [
        "최근 failed run timeline 확인",
        "실패 tool과 error message 확인",
        "반복 실패면 memory/playbook으로 저장 요청"
      ]
    });
  }

  if (input.staleApprovals > 0 || input.highRiskApprovals > 0) {
    actions.push({
      id: "review-risky-approvals",
      priority: "high",
      category: "approval",
      urgencyScore: clampScore(72 + input.highRiskApprovals * 8 + input.staleApprovals * 5),
      title: "오래된/위험 승인 먼저 검토",
      reason: `high risk ${input.highRiskApprovals}건, stale ${input.staleApprovals}건`,
      prompt: "승인 대기 작업을 impact와 체크리스트 기준으로 우선순위 정리해줘",
      expectedOutcome: "삭제/발행/저장 요청을 위험도와 오래된 순서로 검토합니다.",
      checklist: [
        "Execution Gate block 여부 확인",
        "impact 예상 row/게시글 preview 확인",
        "고위험 작업은 승인 메모를 남기고 낮은 트래픽 시간대 실행"
      ]
    });
  } else if (input.pendingApprovals > 0) {
    actions.push({
      id: "review-pending-approvals",
      priority: "medium",
      category: "approval",
      urgencyScore: clampScore(48 + input.pendingApprovals * 4),
      title: "승인 대기 작업 검토",
      reason: `승인 대기 ${input.pendingApprovals}건`,
      prompt: "승인 대기 작업을 검토해줘",
      expectedOutcome: "현재 대기열의 impact와 승인/거절 기준을 확인합니다.",
      checklist: [
        "impact summary와 checklist 확인",
        "필수 대상값 누락 여부 확인",
        "불필요한 요청은 사유를 남기고 거절"
      ]
    });
  }

  if (input.apiErrors > 0) {
    actions.push({
      id: "diagnose-pubg-api-errors",
      priority: input.apiErrors >= input.thresholds.apiErrorsCritical ? "high" : "medium",
      category: "stability",
      urgencyScore: clampScore(input.apiErrors >= input.thresholds.apiErrorsCritical ? 82 + input.apiErrors : 54 + input.apiErrors * 2),
      title: "PUBG API 에러 진단",
      reason: `최근 ${input.thresholds.windowHours}시간 API 에러 ${input.apiErrors}건`,
      prompt: "최근 PUBG API 에러 원인을 route/status별로 분석하고 조치안을 제안해줘",
      expectedOutcome: "429/quota, 네트워크, API 응답 문제를 나눠 조치안을 제시합니다.",
      checklist: [
        "status code와 route별 분포 확인",
        "remaining quota와 429 여부 확인",
        "재시도/캐시 우선/playbook 적용 여부 결정"
      ]
    });
  }

  if (input.aiCost > input.thresholds.aiCostWarnUsd) {
    actions.push({
      id: "review-ai-cost",
      priority: input.aiCost > input.thresholds.aiCostCriticalUsd ? "high" : "medium",
      category: "cost",
      urgencyScore: clampScore(input.aiCost > input.thresholds.aiCostCriticalUsd ? 84 : 58),
      title: "AI 비용 사용량 점검",
      reason: `최근 ${input.thresholds.windowHours}시간 AI 비용 $${input.aiCost}`,
      prompt: "최근 AI 비용과 토큰 사용량을 분석하고 줄일 수 있는 요청을 찾아줘",
      expectedOutcome: "고비용 모델/분석 타입과 캐시 가능한 요청을 찾습니다.",
      checklist: [
        "고비용 요청 유형과 사용자 흐름 확인",
        "중복 분석 캐시 가능 여부 확인",
        "임계치 초과가 반복되면 threshold 조정 검토"
      ]
    });
  }

  if (input.deploymentHealth?.configured && input.deploymentHealth.severity !== "ok") {
    actions.push({
      id: "inspect-deployment-failure",
      priority: input.deploymentHealth.severity === "critical" ? "high" : "medium",
      category: "deploy",
      urgencyScore: input.deploymentHealth.severity === "critical" ? 88 : 60,
      title: "Vercel 배포 상태 확인",
      reason: input.deploymentHealth.message,
      prompt: "최근 Vercel 배포 실패 원인을 분석해줘",
      expectedOutcome: "실패 배포와 관련 로그 확인 순서를 정리합니다.",
      checklist: [
        "최근 deployment state와 UID 확인",
        "GitHub Actions 성공 여부와 비교",
        "무료 플랜 빌드 시간/외부 fetch 실패 여부 확인"
      ]
    });
  }

  if (!actions.length && input.contentRecommendations?.[0]) {
    actions.push({
      id: "draft-content-from-performance",
      priority: "low",
      category: "content",
      urgencyScore: 28,
      title: "콘텐츠 성과 기반 초안 생성",
      reason: input.contentRecommendations[0],
      prompt: "최근 게시글 성과를 바탕으로 이번 주 콘텐츠 초안을 만들어줘",
      expectedOutcome: "현재 반응이 좋은 주제 기반 게시글 초안이 생성됩니다.",
      checklist: [
        "상위 게시글 주제와 engagement 확인",
        "중복 공지/패치노트 여부 확인",
        "발행은 승인 요청으로만 진행"
      ]
    });
  }

  if (!actions.length) {
    actions.push({
      id: "save-daily-briefing",
      priority: "low",
      category: "report",
      urgencyScore: 18,
      title: "정상 운영 브리핑 저장",
      reason: "운영 상태가 정상 범위입니다.",
      prompt: "오늘 운영 브리핑을 리포트로 저장 요청해줘",
      expectedOutcome: "정상 상태 리포트를 memory에 남길 승인 요청을 생성합니다.",
      checklist: [
        "요약 수치가 정상인지 확인",
        "Daily Ops Digest로 짧게 공유",
        "필요하면 요약 저장으로 승인 요청 생성"
      ]
    });
  }

  return actions.sort((a, b) => {
    const scoreDiff = b.urgencyScore - a.urgencyScore;
    if (scoreDiff) return scoreDiff;
    return priorityWeight(b.priority) - priorityWeight(a.priority);
  }).slice(0, 4);
}

function priorityWeight(priority: AgentNextAction["priority"]) {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}
