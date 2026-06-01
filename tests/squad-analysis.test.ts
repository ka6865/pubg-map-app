import { describe, it, expect } from "vitest";

// Nickname normalization helper
function normalizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
}

// 1. Party Group Detection Logic
function groupSquadMatches(matches: any[], lowerNickname: string) {
  const groupMap = new Map<string, { matchIds: string[]; members: string[] }>();

  matches.forEach(m => {
    const fullResult = m.data?.fullResult;
    if (!fullResult) return;
    const mode = fullResult.gameMode || "";
    if (!mode.includes("squad")) return;

    const team = fullResult.team || [];
    // Keep casing for returned members but filter out the search player
    const members = team
      .map((t: any) => t.name)
      .filter((name: string) => name && normalizeName(name) !== lowerNickname)
      .sort((a: string, b: string) => a.localeCompare(b));

    if (members.length === 0) return;

    const key = members.join(", ");
    const existing = groupMap.get(key);
    if (existing) {
      existing.matchIds.push(m.match_id);
    } else {
      groupMap.set(key, {
        matchIds: [m.match_id],
        members: members
      });
    }
  });

  return Array.from(groupMap.entries()).map(([key, value]) => ({
    groupKey: key,
    matchCount: value.matchIds.length,
    matchIds: value.matchIds,
    members: value.members
  })).sort((a, b) => b.matchCount - a.matchCount);
}

// 2. Individual Role Assignment Logic
function computeRoleProfiles(squadMembers: string[], playerAccumStats: Record<string, any>) {
  return squadMembers.map(name => {
    const stats = playerAccumStats[name];
    
    const getShare = (field: "damage" | "kills" | "assists" | "dbnos") => {
      const total = squadMembers.reduce((sum, n) => sum + playerAccumStats[n][field], 0);
      return total > 0 ? (stats[field] / total) : 0.25;
    };

    const shares = {
      damage: getShare("damage"),
      kill: getShare("kills"),
      assist: getShare("assists"),
      dbno: getShare("dbnos")
    };

    let role = "전술가";
    const maxShare = Math.max(shares.damage, shares.kill, shares.assist, shares.dbno);
    if (maxShare === shares.damage) {
      role = "메인 딜러";
    } else if (maxShare === shares.dbno) {
      role = "선봉장";
    } else if (maxShare === shares.kill) {
      role = "해결사";
    } else if (maxShare === shares.assist) {
      role = "지원가";
    }

    return { name, role, shares };
  });
}

// 3. Synergy Score Normalization Logic (Relative benchmarking formula)
interface BenchmarkStats {
  avgIsolation: number;
  avgTradeLatency: number;
  avgReviveRate: number;
  avgSmokeRate: number;
  avgTeamWipes: number;
}

function computeScores(
  avgIsolation: number,
  avgTradeLatency: number,
  totalSmokeRescues: number,
  totalRevives: number,
  avgCoverRate: number,
  totalTeamWipes: number,
  matchCount: number,
  accumTeammateKnocks: number,
  benchmark: BenchmarkStats
) {
  const userReviveRate = (totalRevives / Math.max(1, accumTeammateKnocks)) * 105;
  const userSmokeRate = (totalSmokeRescues / Math.max(1, accumTeammateKnocks)) * 105;
  const userWipes = totalTeamWipes / matchCount;

  return {
    formation: Math.max(10, Math.min(100, Math.round(70 + (benchmark.avgIsolation - avgIsolation) * 40))),
    backupSpeed: Math.max(10, Math.min(100, Math.round(70 + (benchmark.avgTradeLatency - avgTradeLatency) / 150))),
    survivalCare: Math.max(10, Math.min(100, Math.round(70 + (userReviveRate - benchmark.avgReviveRate) * 1.5 + (userSmokeRate - benchmark.avgSmokeRate) * 5))),
    focusFire: Math.max(10, Math.min(100, Math.round(70 + (avgCoverRate - 0.30) * 100))),
    teamWipe: Math.max(10, Math.min(100, Math.round(70 + (userWipes - benchmark.avgTeamWipes) * 6)))
  };
}

describe("PUBG Squad Synergy Analysis Tests", () => {
  it("should correctly group squad matches by teammate composition while maintaining nickname casing", () => {
    const mockMatches = [
      {
        match_id: "match-1",
        data: {
          fullResult: {
            gameMode: "squad-fpp",
            team: [
              { name: "Player_A" },
              { name: "MiaeQ_Q" },
              { name: "PlayerC" },
              { name: "PlayerD" }
            ]
          }
        }
      },
      {
        match_id: "match-2",
        data: {
          fullResult: {
            gameMode: "squad-fpp",
            team: [
              { name: "Player_A" },
              { name: "MiaeQ_Q" },
              { name: "PlayerC" },
              { name: "PlayerD" }
            ]
          }
        }
      }
    ];

    const result = groupSquadMatches(mockMatches, "player_a"); // normalized name matching
    expect(result.length).toBe(1);
    // Verified casing preserved key
    expect(result[0].groupKey).toBe("MiaeQ_Q, PlayerC, PlayerD");
    expect(result[0].matchCount).toBe(2);
  });

  it("should assign correct roles based on individual share thresholds", () => {
    const members = ["Player_A", "Teammate_B", "Teammate_C", "Teammate_D"];
    const stats = {
      "Player_A": { damage: 800, kills: 2, assists: 1, dbnos: 2 },    // High damage share
      "Teammate_B": { damage: 200, kills: 1, assists: 0, dbnos: 5 },   // High knockdown share
      "Teammate_C": { damage: 300, kills: 5, assists: 0, dbnos: 1 },   // High kill share
      "Teammate_D": { damage: 150, kills: 0, assists: 8, dbnos: 0 }    // High assist share
    };

    const roles = computeRoleProfiles(members, stats);
    expect(roles.find(r => r.name === "Player_A")?.role).toBe("메인 딜러");
    expect(roles.find(r => r.name === "Teammate_B")?.role).toBe("선봉장");
    expect(roles.find(r => r.name === "Teammate_C")?.role).toBe("해결사");
    expect(roles.find(r => r.name === "Teammate_D")?.role).toBe("지원가");
  });

  it("should normalize and scale synergy scores into 10 - 100 range correctly based on benchmarks", () => {
    const mockBenchmark = {
      avgIsolation: 1.36,
      avgTradeLatency: 12143,
      avgReviveRate: 17.0,
      avgSmokeRate: 3.58,
      avgTeamWipes: 5.33
    };

    // Top performance scenario (low isolation, extremely fast backup, high smoke/revive, high cover, high wipes)
    const topScores = computeScores(0.8, 1500, 10, 10, 0.70, 40, 4, 10, mockBenchmark);
    expect(topScores.formation).toBe(92); // 70 + (1.36 - 0.8) * 40 = 70 + 22.4 = 92
    expect(topScores.backupSpeed).toBe(100); // 70 + (12143 - 1500)/150 = 70 + 70.9 = 140.9 -> 100 (clamp)
    expect(topScores.survivalCare).toBe(100); // clamped to 100 (clamp)
    expect(topScores.focusFire).toBe(100); // 70 + (0.70 - 0.30)*100 = 110 -> 100 (clamp)
    expect(topScores.teamWipe).toBe(98); // 70 + (10 - 5.33)*6 = 70 + 28 = 98

    // Extreme poor performance scenario (scores clamped to min boundaries)
    const poorScores = computeScores(5.0, 30000, 0, 0, 0.05, 0, 4, 10, mockBenchmark);
    expect(poorScores.formation).toBe(10); // clamped to min 10
    expect(poorScores.backupSpeed).toBe(10); // clamped to min 10
    expect(poorScores.survivalCare).toBe(27); // 70 + (0 - 17.0)*1.5 + (0 - 3.58)*5 = 70 - 25.5 - 17.9 = 26.6 -> 27
    expect(poorScores.focusFire).toBe(45); // 70 + (0.05 - 0.30)*100 = 45
    expect(poorScores.teamWipe).toBe(38); // 70 + (0 - 5.33)*6 = 70 - 32 = 38
  });
});