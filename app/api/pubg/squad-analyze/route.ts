import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// Normalizes player nickname (removes non-alphanumeric characters and lowercases)
function normalizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
}

export async function getSquadAnalysisData(nickname: string, platform: string = "steam", groupKey?: string | null) {
  const lowerNickname = nickname.toLowerCase();
  const supabase = await createClient();

  // 1. Fetch the last 20 processed match telemetries for the player from Supabase
  const { data: matchData, error: dbError } = await supabase
    .from("processed_match_telemetry")
    .select("match_id, data, updated_at")
    .eq("player_id", lowerNickname)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (dbError) {
    console.error("[SQUAD-DB-ERROR]", dbError);
    throw new Error("Database error occurred.");
  }

  if (!matchData || matchData.length === 0) {
    return {
      message: "No match records found. Please search and analyze matches first.",
      groups: []
    };
  }

  // 2. Filter matches to keep squad games only
  const squadMatches = matchData.filter(m => {
    const fullResult = m.data?.fullResult;
    if (!fullResult) return false;
    const mode = fullResult.gameMode || "";
    return mode.includes("squad");
  });

  // 3. Auto-detect squad parties (groups) from the squad matches
  const groupMap = new Map<string, { matchIds: string[]; members: string[] }>();

  squadMatches.forEach(m => {
    const fullResult = m.data?.fullResult;
    const team = fullResult.team || [];
    
    // Extract teammate names (excluding the search player) and sort alphabetically
    const teammates = team
      .map((t: any) => t.name)
      .filter((name: string) => name && normalizeName(name) !== lowerNickname)
      .sort((a: string, b: string) => a.localeCompare(b));

    if (teammates.length === 0) return;

    const key = teammates.join(", ");
    const existing = groupMap.get(key);
    if (existing) {
      existing.matchIds.push(m.match_id);
    } else {
      groupMap.set(key, {
        matchIds: [m.match_id],
        members: teammates
      });
    }
  });

  // Convert map to sorted group list
  const groups = Array.from(groupMap.entries()).map(([key, value]) => ({
    groupKey: key,
    matchCount: value.matchIds.length,
    matchIds: value.matchIds,
    members: value.members
  })).sort((a, b) => b.matchCount - a.matchCount);

  // 4. If groupKey is not specified, return the detected groups list
  if (!groupKey) {
    return { groups };
  }

  // 5. If groupKey is specified, perform detailed squad synergy analysis
  const selectedGroup = groups.find(g => g.groupKey === groupKey);
  if (!selectedGroup) {
    throw new Error("Selected squad group not found.");
  }

  const targetMatchIds = new Set(selectedGroup.matchIds);
  const targetMatches = squadMatches.filter(m => targetMatchIds.has(m.match_id));
  const matchCount = targetMatches.length;

  // Accumulators for squad metrics
  let accumIsolation = 0;
  let accumTradeLatency = 0;
  let validTradeLatencyCount = 0;
  let totalSmokeRescues = 0;
  let totalRevives = 0;
  let accumCoverRate = 0;
  let totalTeamWipes = 0;
  let accumTeammateKnocks = 0;

  // All squad members including the searched player
  const allMembers = [selectedGroup.members.find(m => normalizeName(m) === lowerNickname) || nickname, ...selectedGroup.members];
  // Ensure uniqueness and filter out empty names
  const squadMembers = Array.from(new Set(allMembers)).filter(Boolean);

  // Accumulators for individual stats
  const playerAccumStats: Record<string, { damage: number; kills: number; assists: number; dbnos: number }> = {};
  squadMembers.forEach(name => {
    playerAccumStats[name] = { damage: 0, kills: 0, assists: 0, dbnos: 0 };
  });

  // 1. 대표 티어 결정을 위해 매치별 티어 빈도수 집계
  const tierCounts: Record<string, number> = {};

  // Extract metrics from each match
  targetMatches.forEach(m => {
    const data = m.data || {};
    const fullResult = data.fullResult || {};
    const isolationData = fullResult.isolationData || {};
    const tradeStats = fullResult.tradeStats || {};

    accumIsolation += isolationData.isolationIndex !== undefined ? isolationData.isolationIndex : 2.0;
    
    const tradeLatency = tradeStats.tradeLatencyMs;
    if (tradeLatency !== undefined && tradeLatency > 0) {
      accumTradeLatency += tradeLatency;
      validTradeLatencyCount++;
    }
    
    totalSmokeRescues += tradeStats.smokeRescues || 0;
    totalRevives += tradeStats.revCount || 0;
    accumCoverRate += tradeStats.coverRate !== undefined ? tradeStats.coverRate : 0.3;
    totalTeamWipes += tradeStats.enemyTeamWipes || 0;
    accumTeammateKnocks += tradeStats.teammateKnocks || 0;

    // 집계용 매치 티어 수집
    const matchTier = fullResult.matchInfo?.tier || fullResult.benchmark?.tier;
    if (matchTier) {
      tierCounts[matchTier] = (tierCounts[matchTier] || 0) + 1;
    }

    // Accumulate individual match performance
    const team = fullResult.team || [];
    team.forEach((t: any) => {
      const matchingMember = squadMembers.find(mName => normalizeName(mName) === normalizeName(t.name));
      if (matchingMember) {
        playerAccumStats[matchingMember].damage += t.damageDealt || 0;
        playerAccumStats[matchingMember].kills += t.kills || 0;
        playerAccumStats[matchingMember].assists += t.assists || 0;
        playerAccumStats[matchingMember].dbnos += t.DBNOs || 0;
      }
    });
  });

  // Calculate averages
  const avgIsolation = matchCount > 0 ? (accumIsolation / matchCount) : 2.0;
  const avgTradeLatency = validTradeLatencyCount > 0 ? (accumTradeLatency / validTradeLatencyCount) : 12000;
  const avgCoverRate = matchCount > 0 ? (accumCoverRate / matchCount) : 0.3;

  // 2. 가장 빈도가 높은 대표 티어 설정 (없으면 B)
  let detectedTier = "B";
  let maxCount = 0;
  Object.entries(tierCounts).forEach(([tier, count]) => {
    if (count > maxCount) {
      maxCount = count;
      detectedTier = tier;
    }
  });

  const baseTierChar = detectedTier.trim().charAt(0).toUpperCase();
  const targetTier = ["S", "A", "B", "C", "D"].includes(baseTierChar) ? baseTierChar : "B";

  // 3. Fallback용 티어별 벤치마크 통계 세트
  interface BenchmarkStats {
    avgIsolation: number;
    avgTradeLatency: number;
    avgReviveRate: number;
    avgSmokeRate: number;
    avgTeamWipes: number;
  }

  const DEFAULT_BENCHMARKS: Record<string, BenchmarkStats> = {
    "S": { avgIsolation: 1.02, avgTradeLatency: 10810, avgReviveRate: 22.6, avgSmokeRate: 3.72, avgTeamWipes: 7.18 },
    "A": { avgIsolation: 1.36, avgTradeLatency: 12143, avgReviveRate: 17.0, avgSmokeRate: 3.58, avgTeamWipes: 5.33 },
    "B": { avgIsolation: 1.53, avgTradeLatency: 11642, avgReviveRate: 9.53, avgSmokeRate: 3.62, avgTeamWipes: 2.80 },
    "C": { avgIsolation: 1.40, avgTradeLatency: 12940, avgReviveRate: 4.29, avgSmokeRate: 1.18, avgTeamWipes: 0.81 },
    "D": { avgIsolation: 2.53, avgTradeLatency: 20000, avgReviveRate: 0.00, avgSmokeRate: 0.00, avgTeamWipes: 0.19 }
  };

  let benchmark = { ...DEFAULT_BENCHMARKS[targetTier] };

  // 4. Supabase DB에서 실시간 글로벌 벤치마크 평균 조회 시도 (스쿼드 모드 기준)
  try {
    const { data: dbBench, error: benchError } = await supabase
      .from("global_benchmarks")
      .select("isolation_index, trade_latency_ms, revive_rate, smoke_rate, team_wipes")
      .eq("tier", detectedTier)
      .in("game_mode", ["squad", "squad-fpp"]);

    if (!benchError && dbBench && dbBench.length > 5) {
      let isoSum = 0;
      let latSum = 0;
      let latCount = 0;
      let revSum = 0;
      let smkSum = 0;
      let wipeSum = 0;

      dbBench.forEach(row => {
        isoSum += row.isolation_index || 0;
        const lat = row.trade_latency_ms;
        if (lat && lat > 0) {
          latSum += lat;
          latCount++;
        }
        revSum += row.revive_rate || 0;
        smkSum += row.smoke_rate || 0;
        wipeSum += Number(row.team_wipes) || 0;
      });

      benchmark = {
        avgIsolation: isoSum / dbBench.length,
        avgTradeLatency: latCount > 0 ? (latSum / latCount) : benchmark.avgTradeLatency,
        avgReviveRate: revSum / dbBench.length,
        avgSmokeRate: smkSum / dbBench.length,
        avgTeamWipes: wipeSum / dbBench.length
      };
    } else {
      // 대표 알파벳 매핑으로 재시도
      const { data: dbBenchBase, error: benchBaseError } = await supabase
        .from("global_benchmarks")
        .select("isolation_index, trade_latency_ms, revive_rate, smoke_rate, team_wipes")
        .like("tier", `${targetTier}%`)
        .in("game_mode", ["squad", "squad-fpp"]);

      if (!benchBaseError && dbBenchBase && dbBenchBase.length > 5) {
        let isoSum = 0;
        let latSum = 0;
        let latCount = 0;
        let revSum = 0;
        let smkSum = 0;
        let wipeSum = 0;

        dbBenchBase.forEach(row => {
          isoSum += row.isolation_index || 0;
          const lat = row.trade_latency_ms;
          if (lat && lat > 0) {
            latSum += lat;
            latCount++;
          }
          revSum += row.revive_rate || 0;
          smkSum += row.smoke_rate || 0;
          wipeSum += Number(row.team_wipes) || 0;
        });

        benchmark = {
          avgIsolation: isoSum / dbBenchBase.length,
          avgTradeLatency: latCount > 0 ? (latSum / latCount) : benchmark.avgTradeLatency,
          avgReviveRate: revSum / dbBenchBase.length,
          avgSmokeRate: smkSum / dbBenchBase.length,
          avgTeamWipes: wipeSum / dbBenchBase.length
        };
      }
    }
  } catch (err) {
    console.warn("[SQUAD-ANALYZE] Live benchmark query failed, fallback used:", err);
  }

  // 5. 상대평가 점수화 산정 공식 계산 (중간 70점 기준 가감산)
  const userReviveRate = (totalRevives / Math.max(1, accumTeammateKnocks)) * 100;
  const userSmokeRate = (totalSmokeRescues / Math.max(1, accumTeammateKnocks)) * 100;
  const userWipes = totalTeamWipes / matchCount;

  const formationScore = Math.max(10, Math.min(100, Math.round(70 + (benchmark.avgIsolation - avgIsolation) * 40)));
  const backupSpeedScore = Math.max(10, Math.min(100, Math.round(70 + (benchmark.avgTradeLatency - avgTradeLatency) / 150)));
  const survivalCareScore = Math.max(10, Math.min(100, Math.round(70 + (userReviveRate - benchmark.avgReviveRate) * 1.5 + (userSmokeRate - benchmark.avgSmokeRate) * 5)));
  const focusFireScore = Math.max(10, Math.min(100, Math.round(70 + (avgCoverRate - 0.30) * 100)));
  const teamWipeScore = Math.max(10, Math.min(100, Math.round(70 + (userWipes - benchmark.avgTeamWipes) * 6)));

  const scores = {
    formation: formationScore,
    backupSpeed: backupSpeedScore,
    survivalCare: survivalCareScore,
    focusFire: focusFireScore,
    teamWipe: teamWipeScore
  };

  // 6. 종합 점수 및 최종 등급 판정
  const overallScore = Math.round(
    formationScore * 0.20 +
    backupSpeedScore * 0.25 +
    survivalCareScore * 0.15 +
    focusFireScore * 0.25 +
    teamWipeScore * 0.15
  );

  let squadGrade = "B";
  if (overallScore >= 95) squadGrade = "S+";
  else if (overallScore >= 90) squadGrade = "S";
  else if (overallScore >= 87) squadGrade = "A+";
  else if (overallScore >= 83) squadGrade = "A";
  else if (overallScore >= 80) squadGrade = "A-";
  else if (overallScore >= 77) squadGrade = "B+";
  else if (overallScore >= 73) squadGrade = "B";
  else if (overallScore >= 70) squadGrade = "B-";
  else if (overallScore >= 65) squadGrade = "C+";
  else if (overallScore >= 60) squadGrade = "C";
  else if (overallScore >= 55) squadGrade = "C-";
  else if (overallScore >= 50) squadGrade = "D+";
  else squadGrade = "D";

  // 7. Calculate cumulative stats to determine division 1sts
  const totalStats = { damage: 0, kills: 0, assists: 0, dbnos: 0 };
  squadMembers.forEach(name => {
    const stats = playerAccumStats[name];
    totalStats.damage += stats.damage;
    totalStats.kills += stats.kills;
    totalStats.assists += stats.assists;
    totalStats.dbnos += stats.dbnos;
  });

  // 8. Find the teammate with the maximum share in each category
  let maxDamageName = "";
  let maxDamageValue = -1;
  let maxDbnoName = "";
  let maxDbnoValue = -1;
  let maxKillName = "";
  let maxKillValue = -1;
  let maxAssistName = "";
  let maxAssistValue = -1;

  squadMembers.forEach(name => {
    const stats = playerAccumStats[name];
    if (stats.damage > maxDamageValue) {
      maxDamageValue = stats.damage;
      maxDamageName = name;
    }
    if (stats.dbnos > maxDbnoValue) {
      maxDbnoValue = stats.dbnos;
      maxDbnoName = name;
    }
    if (stats.kills > maxKillValue) {
      maxKillValue = stats.kills;
      maxKillName = name;
    }
    if (stats.assists > maxAssistValue) {
      maxAssistValue = stats.assists;
      maxAssistName = name;
    }
  });

  // Calculate individual role profiles and contribution shares
  const roleProfiles = squadMembers.map(name => {
    const stats = playerAccumStats[name];
    
    const shares = {
      damage: totalStats.damage > 0 ? Math.round((stats.damage / totalStats.damage) * 100) : 25,
      kill: totalStats.kills > 0 ? Math.round((stats.kills / totalStats.kills) * 100) : 25,
      assist: totalStats.assists > 0 ? Math.round((stats.assists / totalStats.assists) * 100) : 25,
      dbno: totalStats.dbnos > 0 ? Math.round((stats.dbnos / totalStats.dbnos) * 100) : 25
    };

    // Determine role based on team relative ranking (1st place receives the primary role)
    let role = "전술가";
    let roleDesc = "균형 잡힌 전투 지표를 유지하며 팀의 운영을 돕는 전략가입니다.";

    const deviations = [
      { key: "메인 딜러", val: shares.damage, desc: "팀의 주력 화력을 담당하며 가장 높은 딜량 지분을 보유합니다.", isLeader: maxDamageName === name },
      { key: "선봉장", val: shares.dbno, desc: "교전 시 먼저 적을 기절시켜 전투의 포문을 여는 돌격대장입니다.", isLeader: maxDbnoName === name },
      { key: "해결사", val: shares.kill, desc: "기절한 적을 확실하게 마무리하거나 교전을 승리로 결정짓는 종결자입니다.", isLeader: maxKillName === name },
      { key: "지원가", val: shares.assist, desc: "아군의 전투를 보조하고 뛰어난 어시스트 기여도를 보여주는 서포터입니다.", isLeader: maxAssistName === name }
    ];

    const leaderCategories = deviations.filter(d => d.isLeader);

    if (leaderCategories.length > 0) {
      const bestCategory = leaderCategories.sort((a, b) => b.val - a.val)[0];
      role = bestCategory.key;
      roleDesc = bestCategory.desc;
    }

    return {
      name,
      role,
      roleDesc,
      avgDamage: Math.round(stats.damage / matchCount),
      avgKills: Number((stats.kills / matchCount).toFixed(1)),
      avgAssists: Number((stats.assists / matchCount).toFixed(1)),
      avgDbnos: Number((stats.dbnos / matchCount).toFixed(1)),
      totalDamage: stats.damage,
      totalKills: stats.kills,
      shares
    };
  });

  const MAP_DISPLAY_NAMES: Record<string, string> = {
    Baltic_Main: "에란겔",
    Desert_Main: "미라마",
    Savage_Main: "사녹",
    Tiger_Main: "태이고",
    Neon_Main: "론도",
    Kiki_Main: "데스턴",
    Summerland_Main: "칼린도",
    Heaven_Main: "헤이븐"
  };

  const matchesSummary = targetMatches.map(m => {
    const fullResult = (m.data as any)?.fullResult || {};
    const mapName = fullResult.mapName || "Unknown";
    const stats = fullResult.stats || {};
    const winPlace = stats.winPlace || 0;
    return {
      matchId: m.match_id,
      mapName,
      mapDisplayName: MAP_DISPLAY_NAMES[mapName] || mapName,
      winPlace,
      createdAt: fullResult.createdAt || m.updated_at
    };
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    groupKey,
    matchCount,
    matchesSummary,
    stats: {
      avgIsolation: Number(avgIsolation.toFixed(2)),
      avgTradeLatency: Math.round(avgTradeLatency),
      totalSmokeRescues,
      totalRevives,
      avgCoverRate: Number(avgCoverRate.toFixed(2)),
      totalTeamWipes
    },
    scores,
    squadGrade,
    roleProfiles,
    benchmarkStats: {
      tier: detectedTier,
      avgIsolation: Number(benchmark.avgIsolation.toFixed(2)),
      avgTradeLatency: Math.round(benchmark.avgTradeLatency),
      avgReviveRate: Number(benchmark.avgReviveRate.toFixed(2)),
      avgSmokeRate: Number(benchmark.avgSmokeRate.toFixed(2)),
      avgTeamWipes: Number(benchmark.avgTeamWipes.toFixed(2))
    }
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const nickname = searchParams.get("nickname");
  const platform = searchParams.get("platform") || "steam";
  const groupKey = searchParams.get("groupKey");

  if (!nickname) {
    return NextResponse.json({ error: "Nickname is required." }, { status: 400 });
  }

  try {
    const data = await getSquadAnalysisData(nickname, platform, groupKey);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[SQUAD-ANALYZE-ERROR]", error);
    return NextResponse.json({ error: error.message || "Failed to analyze squad synergy." }, { status: 500 });
  }
}