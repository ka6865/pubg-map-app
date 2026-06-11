import { describe, expect, it } from "vitest";
import {
  buildProcessedTelemetryIdentityRepairPayload,
  findProcessedTelemetryIdentityMismatch,
  type ProcessedTelemetryIdentityAudit
} from "../lib/admin-agent/data-quality";

describe("Admin Agent 데이터 품질 감사", () => {
  it("row.player_id와 fullResult.stats.name 불일치를 identity mismatch로 분류한다", () => {
    const mismatch = findProcessedTelemetryIdentityMismatch({
      match_id: "match-1",
      platform: "steam",
      player_id: "kangheesung_",
      data: {
        fullResult: {
          player_id: "kangheesung_",
          platform: "steam",
          stats: { name: "OtherPlayer" }
        }
      }
    });

    expect(mismatch).toMatchObject({
      match_id: "match-1",
      platform: "steam",
      player_id: "kangheesung_",
      statsName: "otherplayer",
      reason: "row.player_id와 fullResult.stats.name 불일치",
      canDelete: true
    });
  });

  it("fullResult.player_id 불일치도 identity mismatch로 분류한다", () => {
    const mismatch = findProcessedTelemetryIdentityMismatch({
      match_id: "match-1",
      platform: "steam",
      player_id: "kangheesung_",
      data: {
        fullResult: {
          player_id: "otherplayer",
          platform: "steam",
          stats: { name: "KangHeeSung_" }
        }
      }
    });

    expect(mismatch).toMatchObject({
      embeddedPlayerId: "otherplayer",
      reason: "row.player_id와 fullResult.player_id 불일치",
      canDelete: true
    });
  });

  it("platform 컬럼이 없는 row는 mismatch여도 자동 삭제 후보에서 제외한다", () => {
    const mismatch = findProcessedTelemetryIdentityMismatch({
      match_id: "match-1",
      player_id: "kangheesung_",
      data: {
        fullResult: {
          player_id: "kangheesung_",
          platform: "steam",
          stats: { name: "OtherPlayer" }
        }
      }
    });

    expect(mismatch).toMatchObject({
      hasPlatformColumn: false,
      canDelete: false
    });
  });

  it("승인 payload는 삭제 후보를 targetLimit 안으로 제한하고 집계 오염 자동 삭제 금지를 명시한다", () => {
    const deletionTargets = Array.from({ length: 3 }, (_, index) => ({
      match_id: `match-${index}`,
      platform: "steam",
      player_id: `player_${index}`,
      statsName: "other",
      embeddedPlayerId: "other",
      resultPlatform: "steam",
      hasPlatformColumn: true,
      canDelete: true,
      reason: "row.player_id와 fullResult.stats.name 불일치"
    }));
    const audit: ProcessedTelemetryIdentityAudit = {
      mode: "dry-run",
      table: "processed_match_telemetry",
      recentDays: 2,
      maxRows: 1000,
      scannedRows: 1000,
      mismatchCount: 10,
      missingPlatformColumnRows: 0,
      deletionCandidateCount: 3,
      samples: deletionTargets.slice(0, 1),
      deletionTargets,
      truncated: false,
      generatedAt: "2026-06-11T00:00:00.000Z"
    };

    const payload = buildProcessedTelemetryIdentityRepairPayload(audit, 2);

    expect(payload.targetCount).toBe(2);
    expect(payload.targets).toHaveLength(2);
    expect(payload.warnings.join(" ")).toContain("연막/회복 집계값 오염 가능 row는 자동 삭제하지 않고 재분석으로 교체합니다.");
  });
});
