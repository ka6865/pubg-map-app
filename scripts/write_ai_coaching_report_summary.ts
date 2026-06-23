import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  checkAiCoachingReport,
  DEFAULT_REAL_DATA_AI_COACHING_CASES,
  DEFAULT_SYNTHETIC_AI_COACHING_CASES,
  renderAiCoachingReportMarkdown,
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
  const outputPath = path.resolve(process.cwd(), getArg("--output", "tmp/ai-coaching-gemini-audit.md"));
  const raw = await readFile(reportPath, "utf8");
  const report = JSON.parse(raw) as AiCoachingReport;
  const summary = checkAiCoachingReport(report, {
    reportPath,
    requiredCases: getRequiredCases(),
    requireRawQuality: hasFlag("--require-raw-quality"),
  });
  const markdown = renderAiCoachingReportMarkdown(summary);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");
  console.info(JSON.stringify({
    output: outputPath,
    passedQualityGate: summary.passedQualityGate,
    missingCases: summary.missingCases,
    blockingCases: summary.blockingCases.map((item) => item.name),
    rawBlockingCases: summary.rawBlockingCases.map((item) => item.name),
    metricWarningCases: summary.metricWarningCases.map((item) => item.name),
  }, null, 2));
}

main().catch((error) => {
  console.error("[AI coaching report summary] 실패:", error);
  process.exitCode = 1;
});
