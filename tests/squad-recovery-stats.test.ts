import { describe, expect, it } from "vitest";
import {
  deriveSquadRecoveryStatsFromTimeline,
  hasSquadRecoveryTimelineSignals
} from "@/lib/pubg-analysis/squadRecoveryStats";
import type { TimelineEvent } from "@/lib/pubg-analysis/types";

describe("Squad recovery timeline stats", () => {
  it("counts a teammate smoke and revive as a squad smoke rescue", () => {
    const timeline: TimelineEvent[] = [
      {
        ts: 721_024,
        type: "TEAM_KNOCK",
        victim: "KangHeeSung_",
        attacker: "Ra0n0",
        weapon: "베릴 M762",
        x: 5417.93,
        y: 4043.6
      },
      {
        ts: 733_319,
        type: "ITEM_USE",
        weapon: "연막탄",
        playerName: "MiaeQ_Q",
        x: 5418.28,
        y: 4044.74
      },
      {
        ts: 749_642,
        type: "TEAM_REVIVE",
        victim: "KangHeeSung_",
        playerName: "MiaeQ_Q",
        x: 5416.61,
        y: 4044.7
      }
    ];

    const result = deriveSquadRecoveryStatsFromTimeline(timeline);

    expect(result.squadRevives).toBe(1);
    expect(result.squadSmokeRescues).toBe(1);
    expect(result.smokeRescueCandidates[0]).toMatchObject({
      victim: "KangHeeSung_",
      smokeUser: "MiaeQ_Q",
      reviver: "MiaeQ_Q",
      smokeDeltaMs: 12_295,
      reviveDeltaMs: 28_618
    });
    expect(result.smokeRescueCandidates[0].smokeDistanceM).toBeLessThan(2);
  });

  it("does not count smoke without a matching revive as a smoke rescue", () => {
    const timeline: TimelineEvent[] = [
      {
        ts: 10_000,
        type: "TEAM_KNOCK",
        victim: "0_Jiin",
        x: 100,
        y: 100
      },
      {
        ts: 18_000,
        type: "ITEM_USE",
        weapon: "Smoke Grenade",
        playerName: "KangHeeSung_",
        x: 101,
        y: 100
      },
      {
        ts: 45_000,
        type: "TEAM_REVIVE",
        victim: "0_Jiin",
        playerName: "MiaeQ_Q"
      }
    ];

    const result = deriveSquadRecoveryStatsFromTimeline(timeline);

    expect(result.squadRevives).toBe(1);
    expect(result.squadSmokeRescues).toBe(0);
    expect(result.smokeRescueCandidates).toHaveLength(0);
  });

  it("does not count a distant smoke as rescue cover", () => {
    const timeline: TimelineEvent[] = [
      {
        ts: 10_000,
        type: "TEAM_KNOCK",
        victim: "ckadmfdls__",
        x: 100,
        y: 100
      },
      {
        ts: 12_000,
        type: "ITEM_USE",
        weapon: "Smoke Grenade",
        playerName: "KangHeeSung_",
        x: 350,
        y: 350
      },
      {
        ts: 25_000,
        type: "TEAM_REVIVE",
        victim: "ckadmfdls__",
        playerName: "MiaeQ_Q"
      }
    ];

    const result = deriveSquadRecoveryStatsFromTimeline(timeline);

    expect(result.squadRevives).toBe(1);
    expect(result.squadSmokeRescues).toBe(0);
  });

  it("distinguishes generic timeline presence from recovery timeline signals", () => {
    expect(hasSquadRecoveryTimelineSignals([
      { ts: 1_000, type: "KILL", victim: "Enemy" }
    ])).toBe(false);

    expect(hasSquadRecoveryTimelineSignals([
      { ts: 1_000, type: "TEAM_KNOCK", victim: "Team_B" }
    ])).toBe(true);
  });
});
