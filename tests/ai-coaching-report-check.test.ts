import { describe, expect, it } from "vitest";
import {
  checkAiCoachingReport,
  DEFAULT_REAL_DATA_AI_COACHING_CASES,
  DEFAULT_SYNTHETIC_AI_COACHING_CASES,
  renderAiCoachingReportMarkdown,
} from "../lib/pubg-analysis/aiCoachingReportCheck";

describe("AI coaching report quality gate", () => {
  it("합성 Gemini 리포트 필수 케이스 누락을 실패로 표시한다", () => {
    const cases = DEFAULT_SYNTHETIC_AI_COACHING_CASES
      .filter((name) => name !== "single-spicy-failed-long-backup-smoke-only")
      .map((name) => ({
        name,
        parsed: { feedback: "복구 시간 단축과 피해형 투척, 연막을 분리해서 평가합니다." },
      }));

    const summary = checkAiCoachingReport(
      { generatedAt: "2026-06-23T00:00:00.000Z", model: "gemini-test", cases },
      { requiredCases: [...DEFAULT_SYNTHETIC_AI_COACHING_CASES] }
    );

    expect(summary.passedQualityGate).toBe(false);
    expect(summary.missingCases).toEqual(["single-spicy-failed-long-backup-smoke-only"]);
  });

  it("실데이터 리포트 필수 케이스를 모두 확인한다", () => {
    const cases = DEFAULT_REAL_DATA_AI_COACHING_CASES.map((name) => ({
      name,
      finalText: "교전 정리 후 복구 성공과 복구 시간 단축을 분리하고, 피해형 투척과 연막을 구분합니다.",
    }));

    const summary = checkAiCoachingReport(
      { generatedAt: "2026-06-23T00:00:00.000Z", model: "gemini-test", cases },
      { requiredCases: [...DEFAULT_REAL_DATA_AI_COACHING_CASES] }
    );

    expect(summary.passedQualityGate).toBe(true);
    expect(summary.missingCases).toEqual([]);
    expect(summary.blockingCases).toEqual([]);
  });

  it("리포트에 저장된 오래된 품질 플래그 대신 현재 문구를 다시 검사한다", () => {
    const summary = checkAiCoachingReport({
      cases: [{
        name: "single-spicy-successful-long-backup",
        parsed: { feedback: "팀원을 방패로 세운 느린 백업입니다." },
        hasBlockingQualityIssue: false,
        blockingSignalNames: [],
      }],
    });

    expect(summary.passedQualityGate).toBe(false);
    expect(summary.blockingCases[0]?.blockingSignalNames).toEqual([
      "hasUnsupportedBackupBlame",
      "hasUnsupportedTeamIntent",
    ]);
    expect(summary.blockingCases[0]?.qualityFindings.map((item) => item.match)).toEqual([
      "팀원을 방패",
      "느린 백업",
    ]);
  });

  it("원본 Gemini 응답 품질 요구 시 rawText의 차단 표현도 실패로 표시한다", () => {
    const summary = checkAiCoachingReport(
      {
        cases: [{
          name: "single-spicy-successful-long-backup",
          rawText: JSON.stringify({ feedback: "팀원을 들러리로 세운 방관입니다." }),
          parsed: { feedback: "교전 정리 후 복구 성공과 복구 시간 단축을 분리합니다." },
        }],
      },
      { requireRawQuality: true }
    );

    expect(summary.passedQualityGate).toBe(false);
    expect(summary.blockingCases).toEqual([]);
    expect(summary.rawBlockingCases[0]?.rawBlockingSignalNames).toEqual([
      "hasUnsupportedBackupBlame",
      "hasUnsupportedTeamIntent",
    ]);
    expect(summary.rawBlockingCases[0]?.rawQualityFindings.map((item) => item.match)).toEqual([
      "팀원을 들러리",
      "방관",
    ]);
    expect(summary.rawBlockingCases[0]?.rawQualityFindings[0]?.snippet).toContain("팀원을 들러리");
  });

  it("Markdown 감사 리포트는 누락 케이스와 차단 문구 스니펫을 사람이 읽기 쉽게 출력한다", () => {
    const summary = checkAiCoachingReport(
      {
        generatedAt: "2026-06-23T00:00:00.000Z",
        model: "gemini-test",
        cases: [{
          name: "single-spicy-successful-long-backup",
          rawText: JSON.stringify({ feedback: "팀원을 들러리로 세운 방관입니다." }),
          parsed: { feedback: "팀원을 방패로 세운 느린 백업입니다." },
        }],
      },
      {
        requiredCases: ["single-spicy-successful-long-backup", "squad-spicy"],
        requireRawQuality: true,
      }
    );
    const markdown = renderAiCoachingReportMarkdown(summary);

    expect(markdown).toContain("# AI 코칭 품질 감사 리포트");
    expect(markdown).toContain("품질 게이트: 실패");
    expect(markdown).toContain("누락 케이스: squad-spicy");
    expect(markdown).toContain("## 최종 표시 결과 이슈");
    expect(markdown).toContain("팀원을 방패");
    expect(markdown).toContain("## Gemini 원본 응답 이슈");
    expect(markdown).toContain("팀원을 들러리");
  });

  it("계산 감사는 피해형 투척 적중률 불일치와 연막 오판을 잡는다", () => {
    const summary = checkAiCoachingReport({
      cases: [{
        name: "single-spicy-failed-long-backup-smoke-only",
        parsed: { feedback: "피해형 투척 적중률 60%의 폭파 전문가입니다." },
        metricContext: {
          utility: {
            totalThrows: 5,
            lethalThrows: 0,
            hits: 0,
            accuracy: 60,
            smokes: 5,
          },
        },
      }],
    });

    expect(summary.passedQualityGate).toBe(false);
    expect(summary.metricWarningCases[0]?.metricFindings.map((item) => item.code)).toEqual([
      "utility-accuracy-mismatch",
      "utility-smoke-as-lethal",
    ]);
  });

  it("계산 감사는 성공 복구 맥락과 낮은 고립 지수의 오판을 잡는다", () => {
    const summary = checkAiCoachingReport({
      cases: [{
        name: "single-spicy-successful-long-backup",
        parsed: { feedback: "22초는 느린 백업이며 고립 지수 1.2의 독단 플레이입니다." },
        metricContext: {
          backup: {
            label: "교전 정리 후 복구 성공",
            latencySeconds: 22,
            shouldAvoidSlowBackupBlame: true,
            tradeKills: 2,
            revives: 1,
            teamWipes: 1,
            teammateKnocks: 1,
          },
          isolation: { index: 1.2 },
        },
      }],
    });

    expect(summary.passedQualityGate).toBe(false);
    expect(summary.metricWarningCases[0]?.metricFindings.map((item) => item.code)).toEqual([
      "backup-success-text-blame",
      "low-isolation-misread",
    ]);
  });

  it("계산 감사는 백업과 무관한 치명적 표현을 성공 복구 비난으로 오탐하지 않는다", () => {
    const summary = checkAiCoachingReport({
      cases: [{
        name: "real-single-spicy",
        parsed: { feedback: "반응 속도 1.50초는 교전 시 치명적인 격차를 보이며, 복구 시간 단축은 별도 과제입니다." },
        metricContext: {
          backup: {
            label: "교전 정리 후 복구 성공",
            latencySeconds: null,
            shouldAvoidSlowBackupBlame: true,
            tradeKills: 0,
            revives: 0,
            teamWipes: 7,
            teammateKnocks: 0,
          },
        },
      }],
    });

    expect(summary.passedQualityGate).toBe(true);
    expect(summary.metricWarningCases).toEqual([]);
  });
});
