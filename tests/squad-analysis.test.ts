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

// 3. Synergy Score Normalization Logic
function computeScores(
  avgIsolation: number,
  avgTradeLatency: number,
  totalSmokeRescues: number,
  totalRevives: number,
  avgCoverRate: number,
  totalTeamWipes: number,
  matchCount: number
) {
  return {
    formation: Math.max(10, Math.min(100, Math.round(100 - (avgIsolation - 1) * 20))),
    backupSpeed: Math.max(10, Math.min(100, Math.round(100 - (avgTradeLatency - 2000) / 100))),
    // Scaled survival care: * 25 / matchCount yields 100 at 4 actions per match
    survivalCare: Math.min(100, Math.max(20, Math.round((totalSmokeRescues + totalRevives) * 25 / matchCount))),
    focusFire: Math.min(100, Math.max(20, Math.round(avgCoverRate * 100))),
    teamWipe: Math.min(100, Math.max(20, Math.round(totalTeamWipes * 10)))
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

  it("should normalize and scale synergy scores into 10 - 100 range correctly", () => {
    // Top performance scenario (totalTeamWipes is 20 to yield 100 in score)
    const topScores = computeScores(1.0, 1500, 4, 12, 1.0, 20, 4);
    expect(topScores.formation).toBe(100);
    expect(topScores.backupSpeed).toBe(100);
    expect(topScores.survivalCare).toBe(100);
    expect(topScores.focusFire).toBe(100);
    expect(topScores.teamWipe).toBe(100);

    // Extreme poor performance scenario (scores clamped to min boundaries)
    const poorScores = computeScores(6.0, 15000, 0, 0, 0.05, 0, 4);
    expect(poorScores.formation).toBe(10);
    expect(poorScores.backupSpeed).toBe(10);
    expect(poorScores.survivalCare).toBe(20); // Min bound clamp for survival
    expect(poorScores.focusFire).toBe(20);
    expect(poorScores.teamWipe).toBe(20);
  });
});