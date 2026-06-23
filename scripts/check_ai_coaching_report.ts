import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  checkAiCoachingReport,
  DEFAULT_REAL_DATA_AI_COACHING_CASES,
  DEFAULT_SYNTHETIC_AI_COACHING_CASES,
  type AiCoachingReport,
} from "../lib/pubg-analysis/aiCoachingReportCheck";

function getArg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function getArgs(name: string): string[] {
  return process.argv.reduce<string[]>((values, item, index, args) => {
    if (item === name && args[index + 1]) values.push(args[index + 1]);
    return values;
  }, []);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function getRequiredCases(): string[] {
  const required = new Set<string>(getArgs("--require-case"));

  if (hasFlag("--require-default-suite")) {
    DEFAULT_SYNTHETIC_AI_COACHING_CASES.forEach((name) => required.add(name));
  }

  if (hasFlag("--require-real-suite")) {
    DEFAULT_REAL_DATA_AI_COACHING_CASES.forEach((name) => required.add(name));
  }

  return Array.from(required);
}

async function main() {
  const reportPath = path.resolve(process.cwd(), getArg("--file", "tmp/ai-coaching-gemini-report.json"));
  const allowQualityIssues = hasFlag("--allow-quality-issues");
  const allowMissingCases = hasFlag("--allow-missing-cases");
  const requireRawQuality = hasFlag("--require-raw-quality");
  const requiredCases = getRequiredCases();
  const raw = await readFile(reportPath, "utf8");
  const report = JSON.parse(raw) as AiCoachingReport;

  const summary = checkAiCoachingReport(report, {
    reportPath,
    requiredCases,
    requireRawQuality,
  });

  console.info(JSON.stringify(summary, null, 2));

  if (summary.missingCases.length > 0 && !allowMissingCases) {
    throw new Error(`AI 코칭 리포트 필수 케이스 누락: ${summary.missingCases.join(", ")}`);
  }

  if (summary.blockingCases.length > 0 && !allowQualityIssues) {
    throw new Error(`AI 코칭 리포트 품질 게이트 실패: ${summary.blockingCases.map((item) => `${item.name}(${item.blockingSignalNames.join(",")})`).join(", ")}`);
  }

  if (requireRawQuality && summary.rawBlockingCases.length > 0 && !allowQualityIssues) {
    throw new Error(`AI 코칭 리포트 원본 응답 품질 게이트 실패: ${summary.rawBlockingCases.map((item) => `${item.name}(${item.rawBlockingSignalNames.join(",")})`).join(", ")}`);
  }

  if (summary.metricWarningCases.length > 0 && !allowQualityIssues) {
    throw new Error(`AI 코칭 리포트 계산 감사 실패: ${summary.metricWarningCases.map((item) => `${item.name}(${item.metricFindings.map((finding) => finding.code).join(",")})`).join(", ")}`);
  }
}

main().catch((error) => {
  console.error("[AI coaching report check] 실패:", error);
  process.exitCode = 1;
});
