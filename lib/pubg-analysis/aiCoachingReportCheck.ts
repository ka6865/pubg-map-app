import {
  collectAiCoachingQualitySignals,
  findAiCoachingQualityFindings,
  hasBlockingAiCoachingQualityIssue,
  isBlockingAiCoachingSignal,
  type AiCoachingQualityFinding,
  type AiCoachingQualitySignalName,
  type AiCoachingQualitySignals,
} from "./aiCoachingQuality";

export interface AiCoachingMetricContext {
  backup?: {
    label?: string;
    latencySeconds?: number | null;
    shouldAvoidSlowBackupBlame?: boolean;
    tradeKills?: number;
    revives?: number;
    smokeRescues?: number;
    teamWipes?: number;
    teammateKnocks?: number;
  };
  utility?: {
    totalThrows?: number;
    lethalThrows?: number;
    hits?: number;
    accuracy?: number;
    smokes?: number;
  };
  isolation?: {
    index?: number;
  };
  teamImpact?: {
    damageShare?: number;
    topDamageShare?: number;
  };
}

export interface AiCoachingMetricFinding {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
}

export interface AiCoachingReportCase {
  name?: string;
  parsed?: unknown;
  finalText?: string;
  rawText?: string;
  qualitySignals?: AiCoachingQualitySignals;
  hasBlockingQualityIssue?: boolean;
  blockingSignalNames?: string[];
  metricContext?: AiCoachingMetricContext;
}

export interface AiCoachingReport {
  generatedAt?: string;
  model?: string;
  cases?: AiCoachingReportCase[];
}

export interface CheckedAiCoachingReportCase {
  name: string;
  hasBlockingQualityIssue: boolean;
  blockingSignalNames: string[];
  qualitySignals: AiCoachingQualitySignals;
  qualityFindings: AiCoachingQualityFinding[];
  hasRawBlockingQualityIssue: boolean;
  rawBlockingSignalNames: string[];
  rawQualitySignals: AiCoachingQualitySignals | null;
  rawQualityFindings: AiCoachingQualityFinding[];
  metricFindings: AiCoachingMetricFinding[];
}

export interface AiCoachingReportCheckSummary {
  reportPath: string | null;
  generatedAt: string | null;
  model: string | null;
  caseCount: number;
  requiredCases: string[];
  missingCases: string[];
  passedQualityGate: boolean;
  blockingCases: CheckedAiCoachingReportCase[];
  rawBlockingCases: CheckedAiCoachingReportCase[];
  metricWarningCases: CheckedAiCoachingReportCase[];
  cases: CheckedAiCoachingReportCase[];
}

export const DEFAULT_SYNTHETIC_AI_COACHING_CASES = [
  "single-spicy-successful-long-backup",
  "single-mild-successful-long-backup",
  "single-spicy-failed-long-backup-smoke-only",
  "squad-mild",
  "squad-spicy",
  "summary-ten-match-successful-long-backup",
] as const;

export const DEFAULT_REAL_DATA_AI_COACHING_CASES = [
  "real-single-spicy",
  "real-single-mild",
  "real-summary-ten-match",
  "real-squad-mild",
  "real-squad-spicy",
] as const;

export function getAiCoachingBlockingSignalNames(signals: AiCoachingQualitySignals): string[] {
  return Object.entries(signals)
    .filter(([key, value]) => isBlockingAiCoachingSignal(key as AiCoachingQualitySignalName) && value)
    .map(([key]) => key);
}

function getCaseText(item: AiCoachingReportCase): string {
  if (item.parsed !== undefined) return JSON.stringify(item.parsed);
  if (item.finalText) return item.finalText;
  if (item.rawText) return item.rawText;
  return "";
}

function getNumericValue(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function auditAiCoachingMetrics(item: AiCoachingReportCase): AiCoachingMetricFinding[] {
  const findings: AiCoachingMetricFinding[] = [];
  const text = getCaseText(item);
  const context = item.metricContext;
  if (!context) return findings;

  const backup = context.backup;
  if (backup) {
    const latency = getNumericValue(backup.latencySeconds);
    const recoveryEvidence = Number(backup.tradeKills || 0) + Number(backup.revives || 0) + Number(backup.smokeRescues || 0) + Number(backup.teamWipes || 0);
    if (backup.shouldAvoidSlowBackupBlame && recoveryEvidence <= 0) {
      findings.push({
        code: "backup-success-without-evidence",
        severity: "warning",
        message: "성공 복구 보호 플래그가 켜져 있지만 적 제압/소생/연막 구출/전멸 기여 근거가 없습니다.",
      });
    }
    if (backup.shouldAvoidSlowBackupBlame && /느린 백업|방관|성공이라기엔/.test(text)) {
      findings.push({
        code: "backup-success-text-blame",
        severity: "error",
        message: "성공 복구 맥락인데 최종 텍스트가 느린 백업 또는 방관으로 비난합니다.",
      });
    }
    if (!backup.shouldAvoidSlowBackupBlame && latency !== null && latency >= 18 && recoveryEvidence <= 0) {
      findings.push({
        code: "backup-delay-risk-supported",
        severity: "info",
        message: "긴 백업 시간과 부족한 복구 근거가 함께 있어 백업 지연 위험 피드백이 허용됩니다.",
      });
    }
  }

  const utility = context.utility;
  if (utility) {
    const totalThrows = Number(utility.totalThrows || 0);
    const lethalThrows = Number(utility.lethalThrows || 0);
    const hits = Number(utility.hits || 0);
    const accuracy = getNumericValue(utility.accuracy);
    const expectedAccuracy = lethalThrows > 0 ? Number(((hits / lethalThrows) * 100).toFixed(1)) : 0;
    if (lethalThrows > totalThrows) {
      findings.push({
        code: "utility-lethal-over-total",
        severity: "error",
        message: `피해형 투척 ${lethalThrows}회가 총 투척 ${totalThrows}회를 초과합니다.`,
      });
    }
    if (hits > lethalThrows) {
      findings.push({
        code: "utility-hits-over-lethal",
        severity: "error",
        message: `피해 적중 ${hits}회가 피해형 투척 ${lethalThrows}회를 초과합니다.`,
      });
    }
    if (accuracy !== null && Math.abs(accuracy - expectedAccuracy) > 0.2) {
      findings.push({
        code: "utility-accuracy-mismatch",
        severity: "error",
        message: `피해형 투척 적중률 ${accuracy}%가 피해 적중/피해형 투척 기준 기대값 ${expectedAccuracy}%와 다릅니다.`,
      });
    }
    if (lethalThrows === 0 && /피해형 투척 적중률 [1-9]\d*(?:\.\d+)?%|폭파 전문가|투척물 마스터|정밀 폭격기/.test(text)) {
      findings.push({
        code: "utility-smoke-as-lethal",
        severity: "error",
        message: "피해형 투척이 0회인데 피해형 적중률 또는 폭파형 칭호가 생성되었습니다.",
      });
    }
  }

  const isolationIndex = getNumericValue(context.isolation?.index);
  if (isolationIndex !== null && isolationIndex < 2 && /고립될 위험|독단적인 플레이|독단 플레이|너무 멀리|오합지졸|1인 솔로 4개|혼자 정글북/.test(text)) {
    findings.push({
      code: "low-isolation-misread",
      severity: "error",
      message: `고립 지수 ${isolationIndex}는 낮은 편인데 고립/독단 플레이로 해석했습니다.`,
    });
  }

  const damageShare = getNumericValue(context.teamImpact?.damageShare ?? context.teamImpact?.topDamageShare);
  if (damageShare !== null && damageShare < 50 && /원맨쇼|혼자 다 해먹|팀 전체가 휘청|팀이 무너지는 구조/.test(text)) {
    findings.push({
      code: "moderate-damage-share-overclaim",
      severity: "error",
      message: `최상위 딜 비중 ${damageShare}%는 50% 미만인데 원맨쇼 또는 팀 붕괴 구조로 과장했습니다.`,
    });
  }

  return findings;
}

export function checkAiCoachingReport(
  report: AiCoachingReport,
  options: {
    reportPath?: string | null;
    requiredCases?: string[];
    requireRawQuality?: boolean;
  } = {}
): AiCoachingReportCheckSummary {
  const cases = Array.isArray(report.cases) ? report.cases : [];

  if (cases.length === 0) {
    throw new Error(`AI 코칭 리포트에 cases 배열이 없습니다: ${options.reportPath || "unknown"}`);
  }

  const checkedCases = cases.map((item, index) => {
    const name = item.name || `case-${index + 1}`;
    const qualitySignals = collectAiCoachingQualitySignals(getCaseText(item));
    const blockingSignalNames = getAiCoachingBlockingSignalNames(qualitySignals);
    const hasBlockingQualityIssue = hasBlockingAiCoachingQualityIssue(qualitySignals);
    const qualityFindings = findAiCoachingQualityFindings(getCaseText(item), { blockingOnly: true });
    const rawQualitySignals = item.rawText ? collectAiCoachingQualitySignals(item.rawText) : null;
    const rawBlockingSignalNames = rawQualitySignals ? getAiCoachingBlockingSignalNames(rawQualitySignals) : [];
    const hasRawBlockingQualityIssue = rawQualitySignals ? hasBlockingAiCoachingQualityIssue(rawQualitySignals) : false;
    const rawQualityFindings = item.rawText ? findAiCoachingQualityFindings(item.rawText, { blockingOnly: true }) : [];
    const metricFindings = auditAiCoachingMetrics(item);

    return {
      name,
      hasBlockingQualityIssue,
      blockingSignalNames,
      qualitySignals,
      qualityFindings,
      hasRawBlockingQualityIssue,
      rawBlockingSignalNames,
      rawQualitySignals,
      rawQualityFindings,
      metricFindings,
    };
  });

  const requiredCases = options.requiredCases || [];
  const blockingCases = checkedCases.filter((item) => item.hasBlockingQualityIssue);
  const rawBlockingCases = checkedCases.filter((item) => item.hasRawBlockingQualityIssue);
  const metricWarningCases = checkedCases.filter((item) => item.metricFindings.some((finding) => finding.severity !== "info"));
  const presentCaseNames = new Set(checkedCases.map((item) => item.name));
  const missingCases = requiredCases.filter((name) => !presentCaseNames.has(name));

  return {
    reportPath: options.reportPath || null,
    generatedAt: report.generatedAt || null,
    model: report.model || null,
    caseCount: checkedCases.length,
    requiredCases,
    missingCases,
    passedQualityGate: blockingCases.length === 0 && missingCases.length === 0 && metricWarningCases.length === 0 && (!options.requireRawQuality || rawBlockingCases.length === 0),
    blockingCases,
    rawBlockingCases,
    metricWarningCases,
    cases: checkedCases,
  };
}

function formatSignalList(signals: string[]): string {
  return signals.length > 0 ? signals.join(", ") : "없음";
}

function formatFindings(findings: AiCoachingQualityFinding[], limit = 5): string[] {
  if (findings.length === 0) return ["  - 차단 문구 없음"];
  return findings.slice(0, limit).map((finding) => `  - ${finding.signalName}: "${finding.match}" | ${finding.snippet}`);
}

export function renderAiCoachingReportMarkdown(summary: AiCoachingReportCheckSummary): string {
  const lines = [
    "# AI 코칭 품질 감사 리포트",
    "",
    `- 리포트 파일: ${summary.reportPath || "unknown"}`,
    `- 생성 시각: ${summary.generatedAt || "unknown"}`,
    `- 모델: ${summary.model || "unknown"}`,
    `- 케이스 수: ${summary.caseCount}`,
    `- 품질 게이트: ${summary.passedQualityGate ? "통과" : "실패"}`,
    "",
    "## 필수 케이스",
    "",
    `- 요구 케이스: ${summary.requiredCases.length > 0 ? summary.requiredCases.join(", ") : "없음"}`,
    `- 누락 케이스: ${summary.missingCases.length > 0 ? summary.missingCases.join(", ") : "없음"}`,
    "",
    "## 차단 이슈 요약",
    "",
    `- 최종 표시 결과 차단 케이스: ${summary.blockingCases.length}`,
    `- Gemini 원본 응답 차단 케이스: ${summary.rawBlockingCases.length}`,
    `- 계산/해석 경고 케이스: ${summary.metricWarningCases.length}`,
    "",
  ];

  if (summary.blockingCases.length > 0) {
    lines.push("## 최종 표시 결과 이슈", "");
    summary.blockingCases.forEach((item) => {
      lines.push(`### ${item.name}`);
      lines.push(`- 신호: ${formatSignalList(item.blockingSignalNames)}`);
      lines.push(...formatFindings(item.qualityFindings));
      lines.push("");
    });
  }

  if (summary.rawBlockingCases.length > 0) {
    lines.push("## Gemini 원본 응답 이슈", "");
    summary.rawBlockingCases.forEach((item) => {
      lines.push(`### ${item.name}`);
      lines.push(`- 신호: ${formatSignalList(item.rawBlockingSignalNames)}`);
      lines.push(...formatFindings(item.rawQualityFindings));
      lines.push("");
    });
  }

  if (summary.metricWarningCases.length > 0) {
    lines.push("## 계산/해석 경고", "");
    summary.metricWarningCases.forEach((item) => {
      lines.push(`### ${item.name}`);
      item.metricFindings
        .filter((finding) => finding.severity !== "info")
        .forEach((finding) => {
          lines.push(`- ${finding.severity.toUpperCase()} ${finding.code}: ${finding.message}`);
        });
      lines.push("");
    });
  }

  lines.push("## 전체 케이스 판정", "");
  summary.cases.forEach((item) => {
    const finalStatus = item.hasBlockingQualityIssue ? "최종 표시 결과 이슈 있음" : "최종 표시 결과 통과";
    const rawStatus = item.hasRawBlockingQualityIssue ? "원본 응답 이슈 있음" : "원본 응답 통과";
    const metricStatus = item.metricFindings.some((finding) => finding.severity !== "info") ? "계산 경고 있음" : "계산 경고 없음";
    lines.push(`- ${item.name}: ${finalStatus} / ${rawStatus} / ${metricStatus}`);
  });

  return `${lines.join("\n")}\n`;
}
