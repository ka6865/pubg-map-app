import { NextResponse } from "next/server";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { RESULT_VERSION, WEAPON_NAMES } from "@/lib/pubg-analysis/constants";
import { estimateUserTier } from "@/lib/pubg-analysis/benchmarkScore";
import { classifyRole } from "@/lib/pubg-analysis/roleClassifier";
import { normalizeName } from "@/lib/pubg-analysis/utils";

// ✅ Server Route에서는 SERVICE_ROLE_KEY 기반 서버 클라이언트 사용 (RLS 우회)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 60;

function normalizeWeaponName(weaponId: string): string {
  if (!weaponId) return "Unknown";
  let name = weaponId.toLowerCase();
  name = name.replace(/item_weapon_/, "").replace(/weap/, "").replace(/_c$/, "").replace(/proj/, "");
  const upperName = name.toUpperCase();
  const names = WEAPON_NAMES as any;
  return names[upperName] || names[weaponId] || name;
}

// [V41.0] 유효한 JSON 블록을 추출하는 헬퍼 함수 (AI 환각 방지용)
function extractValidJson(text: string): string {
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return text;
  
  let braceCount = 0;
  let inString = false;
  
  for (let i = firstBrace; i < text.length; i++) {
    const char = text[i];
    
    // 따옴표 내부의 중괄호는 무시 (이스케이프 문자 고려)
    if (char === '"' && (i === 0 || text[i-1] !== '\\')) {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      
      // 첫 번째 중괄호와 짝이 맞는 마지막 중괄호를 찾으면 즉시 반환
      if (braceCount === 0) {
        return text.substring(firstBrace, i + 1);
      }
    }
  }
  return text;
}


function aggregateMatches(matches: any[], lowerNickname: string, myAccountId?: string) {
  let totalKills = 0, totalDamage = 0, totalDamageImpact = 0, totalTeamDamageShare = 0, totalTeamKillShare = 0;
  let totalTeammateKnocks = 0, totalSuppCount = 0, totalTradeKills = 0, totalSmokeCount = 0;
  let totalRevCount = 0, totalBaitCount = 0, totalStunCount = 0, totalSmokes = 0;
  let totalSmokeRescues = 0;
  let totalCoverSuccess = 0, totalCoverAttempts = 0;
  let totalInitiativeSuccess = 0, totalInitiativeAttempts = 0;
  let totalCrossfireCount = 0, totalTeamWipes = 0, totalMaxHitDist = 0;
  let totalDuelWins = 0, totalDuelLosses = 0, totalReversalWins = 0, totalReversalAttempts = 0;
  let totalUtilityThrows = 0, totalUtilityHits = 0, totalUtilityDamage = 0, totalUtilityKills = 0;
  let totalDeathPhase = 0, totalBluezoneWaste = 0;
  let totalEdgePlay = 0, totalFatalDelay = 0, totalStunHits = 0, totalStunDuration = 0;
  let totalFocusFireCount = 0, totalCrossfireExposureCount = 0;
  const totalDistanceDamage = { short: 0, mid: 0, long: 0 };
  let totalIsolationIndexFinal = 0, totalCombatIso = 0, totalDeathIso = 0;
  let totalMinDist = 0, totalHeightDiff = 0, totalTeammateCountFinal = 0, isolationCountFinal = 0;
  let rankedCount = 0, normalCount = 0;

  const backupLatencies: number[] = [], reactionLatencies: number[] = [];
  const goldenTimeFinal = { early: 0, mid1: 0, mid2: 0, late: 0 };
  const killContribFinal = { solo: 0, cleanup: 0 };
  const weaponStatsFinal: Record<string, any> = {};
  const allBadges: any[] = [];

  matches.forEach((m: any) => {
    // [V41.0] Account ID 우선 매칭
    const playerData = myAccountId && m.playerCombatData?.[myAccountId] 
      ? m.playerCombatData[myAccountId] 
      : (m.playerCombatData?.[lowerNickname] || {});

    // 무기 통계 합산 (DB weaponStats 0 이슈 해결을 위해 타임라인 전수조사 병행)
    if (m.weaponStats) {
      Object.entries(m.weaponStats).forEach(([wId, wData]: [string, any]) => {
        const weaponName = normalizeWeaponName(wId);
        if (!weaponStatsFinal[weaponName]) weaponStatsFinal[weaponName] = { kills: 0, dbnos: 0, damage: 0 };
        weaponStatsFinal[weaponName].damage += (wData.damage || 0);
      });
    }
    // 타임라인에서 킬/기절 정보 추출하여 보정
    if (Array.isArray(m.timeline)) {
      m.timeline.forEach((event: any) => {
        if (event.type === 'KILL' || event.type === 'KNOCK' || event.type === 'DOWNED' || event.type === 'TEAM_KNOCK') {
          const weaponName = normalizeWeaponName(event.weapon || 'Unknown');
          if (!weaponStatsFinal[weaponName]) weaponStatsFinal[weaponName] = { kills: 0, dbnos: 0, damage: 0 };
          if (event.type === 'KILL') weaponStatsFinal[weaponName].kills++;
          else weaponStatsFinal[weaponName].dbnos++;
        }
      });
    }
    const isRanked = m.matchType === 'competitive' || (m.gameMode || "").includes("competitive");
    if (isRanked) rankedCount++; else normalCount++;

    if (m.tradeStats) {
      totalTeammateKnocks += m.tradeStats.teammateKnocks || 0;
      totalSuppCount += m.tradeStats.suppCount || 0;
      totalTradeKills += m.tradeStats.tradeKills || 0;
      totalRevCount += m.tradeStats.revCount || 0;
      totalBaitCount += m.tradeStats.baitCount || 0;
      totalCoverAttempts += m.tradeStats.coverRateSampleCount || 0;
      totalCoverSuccess += (m.tradeStats.coverRate > 0 ? Math.round((m.tradeStats.coverRate / 100) * (m.tradeStats.coverRateSampleCount || 1)) : 0);
      if (m.tradeStats.tradeLatencyMs > 0) backupLatencies.push(m.tradeStats.tradeLatencyMs);
      if (m.tradeStats.reactionLatencyMs > 0) reactionLatencies.push(m.tradeStats.reactionLatencyMs);
    }

    totalSmokeCount += m.tradeStats?.smokeCount || 0;
    totalSmokeRescues += m.tradeStats?.smokeRescues || 0;
    totalStunCount += m.itemUseSummary?.stuns || 0;
    totalSmokes += m.itemUseSummary?.smokes || 0;
    totalEdgePlay += m.zoneStrategy?.edgePlayCount || 0;
    totalFatalDelay += m.zoneStrategy?.fatalDelayCount || 0;
    totalStunHits += m.combatPressure?.stunHits || 0;
    totalStunDuration += m.itemUseStats?.stunDurationSum || 0;

    if (m.initiativeSampleCount !== undefined) {
      totalInitiativeAttempts += m.initiativeSampleCount;
      totalInitiativeSuccess += Math.round(((m.initiative_rate || 0) / 100) * m.initiativeSampleCount);
    }

    if (m.isolationData) {
      if (m.isolationData.isCrossfire) totalCrossfireCount++;
      totalIsolationIndexFinal += (m.isolationData.isolationIndex || 0);
      totalCombatIso += (m.isolationData.combatIsolation || 0);
      totalDeathIso += (m.isolationData.deathIsolation || 0);
      totalMinDist += (m.isolationData.minDist || 0);
      totalHeightDiff += (m.isolationData.heightDiff || 0);
      totalTeammateCountFinal += (m.isolationData.teammateCount || 1);
      isolationCountFinal++;
    }

    if (m.duelStats) {
      totalDuelWins += m.duelStats.wins || 0;
      totalDuelLosses += m.duelStats.losses || 0;
      totalReversalWins += m.duelStats.reversals || 0;
      totalReversalAttempts += Math.max(m.duelStats.reversalAttempts || 0, m.duelStats.reversals || 0);
    }
    if (m.combatPressure?.utilityStats) {
      const u = m.combatPressure.utilityStats;
      totalUtilityThrows += u.throwCount || 0;
      totalUtilityHits += u.hitCount || 0;
      totalUtilityDamage += u.totalDamage || 0;
      totalUtilityKills += u.killCount || 0;
    }
    totalMaxHitDist = Math.max(totalMaxHitDist, m.combatPressure?.maxHitDistance || 0);
    totalTeamWipes += m.combatPressure?.enemyTeamWipes || 0;

    if (m.goldenTimeDamage) {
      goldenTimeFinal.early += (m.goldenTimeDamage.early || 0);
      goldenTimeFinal.mid1 += (m.goldenTimeDamage.mid1 || 0);
      goldenTimeFinal.mid2 += (m.goldenTimeDamage.mid2 || 0);
      goldenTimeFinal.late += (m.goldenTimeDamage.late || 0);
    }

    if (m.killContribution) {
      killContribFinal.solo += (m.killContribution.solo || 0);
      killContribFinal.cleanup += (m.killContribution.cleanup || 0);
    }

    totalKills += (m.stats?.kills || 0);
    totalDamage += (m.stats?.damageDealt || 0);
    totalDamageImpact += (m.teamImpact?.damageImpact || 0);
    totalTeamDamageShare += (m.teamImpact?.teamDamageShare || 0);
    totalTeamKillShare += (m.teamImpact?.teamKillShare || 0);
    if (m.badges) allBadges.push(...m.badges);

    totalDeathPhase += (m.deathPhase || 0);
    totalBluezoneWaste += (m.bluezoneWaste || 0);

    totalFocusFireCount += (m.itemUseStats?.focusFireCount || 0);
    totalCrossfireExposureCount += (m.itemUseStats?.crossfireExposureCount || 0);
    if (m.itemUseStats?.distanceDamage) {
      totalDistanceDamage.short += (m.itemUseStats.distanceDamage.short || 0);
      totalDistanceDamage.mid += (m.itemUseStats.distanceDamage.mid || 0);
      totalDistanceDamage.long += (m.itemUseStats.distanceDamage.long || 0);
    }
  });

  const mLen = Math.max(1, matches.length);
  const avgDamage = Math.floor(totalDamage / mLen);
  const avgKills = Number((totalKills / mLen).toFixed(1));
  const avgDamageImpact = Number((totalDamageImpact / mLen).toFixed(1));
  const avgTeamDamageShare = Number((totalTeamDamageShare / mLen).toFixed(1));
  const avgTeamKillShare = Number((totalTeamKillShare / mLen).toFixed(1));

  const badgeCounts: Record<string, number> = {};
  allBadges.forEach((b: any) => { if (b?.name) badgeCounts[b.name] = (badgeCounts[b.name] || 0) + 1; });
  const topBadges = Object.entries(badgeCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => `${name}(${count}회)`).join(", ");

  const userInitiativeRate = totalInitiativeAttempts > 0 ? Math.round((totalInitiativeSuccess / totalInitiativeAttempts) * 100) : -1;
  const userReversalRate = totalReversalAttempts > 0 ? Math.round((totalReversalWins / totalReversalAttempts) * 100) : -1;
  const avgBackupLatency = backupLatencies.length > 0 ? (backupLatencies.reduce((a, b) => a + b, 0) / backupLatencies.length / 1000).toFixed(2) + "s" : "측정 불가";
  const avgReactionLatency = reactionLatencies.length > 0 ? (reactionLatencies.reduce((a, b) => a + b, 0) / reactionLatencies.length / 1000).toFixed(2) + "s" : "측정 불가";
  const avgCoverRate = totalCoverAttempts > 0 ? Math.round((totalCoverSuccess / totalCoverAttempts) * 100) : 0;
  const totalDuels = totalDuelWins + totalDuelLosses;
  const avgDuelWinRate = totalDuels > 0 ? Math.round((totalDuelWins / totalDuels) * 100) : 0;
  const avgDeathPhase = mLen > 0 ? Number((totalDeathPhase / mLen).toFixed(1)) : 0;
  const avgPressureIndex = Number((matches.reduce((acc: number, m: any) => acc + (m.combatPressure?.pressureIndex || 0), 0) / mLen).toFixed(2));
  const totalLethalThrows = matches.reduce((acc: number, m: any) => acc + (m.itemUseStats?.lethalThrowCount || 0), 0);
  const avgUtilityEfficiency = totalLethalThrows > 0 ? Math.round(totalUtilityDamage / totalLethalThrows) : 0;

  const avgMinDistStr = isolationCountFinal > 0 ? (totalMinDist / isolationCountFinal).toFixed(1) + "m" : "N/A";
  const avgHeightDiffStr = isolationCountFinal > 0 ? (totalHeightDiff / isolationCountFinal).toFixed(1) + "m" : "N/A";
  const avgIsolationStr = isolationCountFinal > 0 ? (totalIsolationIndexFinal / isolationCountFinal).toFixed(1) : "0.0";

  const goldenTimeAvg = {
    early: Math.round(goldenTimeFinal.early / mLen),
    mid1: Math.round(goldenTimeFinal.mid1 / mLen),
    mid2: Math.round(goldenTimeFinal.mid2 / mLen),
    late: Math.round(goldenTimeFinal.late / mLen),
  };

  const totalKillContrib = killContribFinal.solo + killContribFinal.cleanup;
  const soloKillRate = totalKillContrib > 0 ? Math.round((killContribFinal.solo / totalKillContrib) * 100) : 0;

  const matchTimes = matches.map((m: any) => {
    const d = new Date(m.createdAt || Date.now());
    return isNaN(d.getTime()) ? Date.now() : d.getTime();
  });
  const latestMatchTime = matchTimes.length > 0 ? new Date(Math.max(...matchTimes)).toISOString() : new Date().toISOString();

  return {
    mLen, avgDamage, avgKills, avgDamageImpact, avgTeamDamageShare, avgTeamKillShare, topBadges,
    userInitiativeRate, userReversalRate, avgBackupLatency, avgReactionLatency, avgCoverRate, avgDuelWinRate,
    totalDuelWins, totalDuelLosses, totalReversalWins, totalReversalAttempts, avgDeathPhase,
    avgPressureIndex, totalLethalThrows, avgUtilityEfficiency, avgMinDistStr, avgHeightDiffStr,
    avgIsolationStr, goldenTimeAvg, soloKillRate, latestMatchTime, killContribFinal,
    rankedCount, normalCount, totalTeammateKnocks, totalSuppCount, totalTradeKills, totalRevCount,
    totalBaitCount, totalSmokeCount, totalStunCount, totalStunHits, totalStunDuration, totalEdgePlay, totalFatalDelay,
    totalMaxHitDist, totalTeamWipes, isolationCountFinal, totalIsolationIndexFinal, totalCombatIso,
    totalDeathIso, totalMinDist, totalHeightDiff, totalCrossfireCount, totalTeammateCountFinal,
    totalUtilityThrows, totalUtilityHits, totalUtilityDamage, totalUtilityKills, totalBluezoneWaste,
    weaponStatsFinal, totalInitiativeAttempts, totalInitiativeSuccess, totalSmokeRescues,
    totalFocusFireCount, totalCrossfireExposureCount, totalDistanceDamage,
    avgDistanceDamage: {
      short: Math.round(totalDistanceDamage.short / mLen),
      mid: Math.round(totalDistanceDamage.mid / mLen),
      long: Math.round(totalDistanceDamage.long / mLen),
    },
    totalSmokes,
    itemUseSummary: { smokes: totalSmokes }
  };
}

export async function POST(request: Request) {
  try {
    const { matchIds, nickname, platform, force = false } = await request.json();
    const lowerNickname = normalizeName(nickname);
    console.log(`[AI-SUMMARY-SYNC-CHECK] Original: ${nickname}, Normalized: ${lowerNickname}`);

    const { data: userBenchmarks } = await supabase
      .from("global_benchmarks")
      .select("*")
      .ilike("player_id", lowerNickname)
      .order('created_at', { ascending: false })
      .limit(50);

    console.log(`[DB-Check] Found ${userBenchmarks?.length || 0} benchmarks for ${lowerNickname}`);

    if (!matchIds || matchIds.length === 0) return NextResponse.json({ error: "No matches" }, { status: 400 });

    if (!force) {
      const { data: existing } = await supabase
        .from('ai_summaries')
        .select('*')
        .eq('nickname', lowerNickname)
        .eq('match_ids', [...matchIds].sort().join(','))
        .maybeSingle();
      
      if (existing && existing.summary_json) {
        console.log(`[AI-SUMMARY] Returning cached summary for ${lowerNickname}`);
        return NextResponse.json(existing.summary_json);
      }
    }

    const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!geminiApiKey) return NextResponse.json({ error: "No API Key" }, { status: 500 });

    const targetMatchIds = matchIds.slice(0, 10);
    const normalizedTargetMatchIds = targetMatchIds.map((id: string) => id.includes(':') ? id.split(':').pop() : id);
    const searchMatchIds = Array.from(new Set([...targetMatchIds, ...normalizedTargetMatchIds])).filter(Boolean);

    const { data: cachedMatches } = await supabase.from("processed_match_telemetry")
      .select("match_id, data")
      .in("match_id", searchMatchIds)
      .or(`player_id.ilike.${lowerNickname},player_id.ilike.${nickname.toLowerCase().replace(/\s/g, "")}`);

    const cachedMap = new Map();
    if (cachedMatches) {
      cachedMatches.forEach(m => {
        const fullResult = (m.data as any)?.fullResult;
        if (fullResult) {
          const pureId = m.match_id.includes(':') ? m.match_id.split(':').pop()! : m.match_id;
          const normalizedData = { ...fullResult, matchId: pureId };
          cachedMap.set(pureId, normalizedData);
          cachedMap.set(m.match_id, normalizedData);
        }
      });
    }

    const missingMatchIds = targetMatchIds.filter((id: string) => !cachedMap.has(id));
    const newResultsMap = new Map();

    if (missingMatchIds.length > 0) {
      const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
      const host = request.headers.get('host') || 'localhost:3000';
      const baseUrl = `${protocol}://${host}`;
      for (let i = 0; i < missingMatchIds.length; i += 3) {
        const batch = missingMatchIds.slice(i, i + 3);
        await Promise.all(batch.map(async (id: string) => {
          try {
            const res = await fetch(`${baseUrl}/api/pubg/match?matchId=${id}&nickname=${nickname}&platform=${platform}`, { cache: 'no-store' });
            if (res.ok) {
              const data = await res.json();
              const pureId = id.includes(':') ? id.split(':').pop()! : id;
              const normalizedData = { ...data, matchId: pureId };
              if (data) newResultsMap.set(pureId, normalizedData);
            }
          } catch (e) { console.error(`[AI-SUMMARY] Match fetch failed for ${id}:`, e); }
        }));
      }
    }

    const allMatches = [...cachedMap.values(), ...newResultsMap.values()];
    const detailedMatches = Array.from(new Map(allMatches.map(m => [m.matchId, m])).values());
    if (detailedMatches.length === 0) return NextResponse.json({ error: "분석 데이터 생성 실패" }, { status: 400 });

    const latestMatch = detailedMatches[0];
    const myAccountId = latestMatch.stats?.playerId;

    const totalStats = aggregateMatches(detailedMatches, lowerNickname, myAccountId);
    const {
      latestMatchTime, avgBackupLatency, avgReactionLatency, userInitiativeRate, avgPressureIndex,
      totalReversalAttempts, totalReversalWins, avgDuelWinRate, totalDuelWins, totalDuelLosses,
      avgDamageImpact, topBadges, goldenTimeAvg, killContribFinal, avgDeathPhase, totalBluezoneWaste, mLen,
      totalTeammateKnocks, totalSuppCount, totalTradeKills, totalSmokeCount, totalRevCount,
      totalBaitCount, totalStunCount, totalStunHits, totalStunDuration, totalEdgePlay, totalFatalDelay, totalMaxHitDist,
      totalTeamWipes, isolationCountFinal, totalIsolationIndexFinal, totalMinDist, totalHeightDiff, totalCrossfireCount, totalTeammateCountFinal,
      totalUtilityThrows, totalUtilityHits, totalUtilityDamage, totalUtilityKills, rankedCount, normalCount,
      totalInitiativeAttempts, totalInitiativeSuccess, totalSmokeRescues,
      totalFocusFireCount, totalCrossfireExposureCount, totalDistanceDamage, totalSmokes
    } = totalStats;

    const groups: Record<string, any[]> = { solo: [], duo: [], squad: [], 'solo-duo': [], 'solo-squad': [] };
    detailedMatches.forEach((m: any) => {
      if (!m.matchId && m.id) m.matchId = m.id;
      if (!m.matchId && m.match_id) m.matchId = m.match_id;

      const gm = m.gameMode || "squad";
      if (gm === 'solo-squad') groups['solo-squad'].push(m);
      else if (gm === 'solo-duo') groups['solo-duo'].push(m);
      else if (gm.includes('solo')) groups.solo.push(m);
      else if (gm.includes('duo')) groups.duo.push(m);
      else groups.squad.push(m);
    });
    const mainModeName = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length)[0];
    const mainModeCount = groups[mainModeName].length;
    const tierConfidence = mainModeCount >= 7 ? '높음' : mainModeCount >= 3 ? '보통' : '낮음 (데이터 부족)';
    const isCompetitiveFocus = rankedCount >= normalCount;
    const isSoloSquadFocus = mainModeName.includes('solo-squad') || mainModeName.includes('solo-duo');

    const MAP_DISPLAY_NAMES: Record<string, string> = {
      Baltic_Main: '에란겔', Desert_Main: '미라마', Savage_Main: '사녹',
      Tiger_Main: '태이고', Neon_Main: '론도', Kiki_Main: '데스턴',
      Summerland_Main: '칼린도', Heaven_Main: '헤이븐'
    };
    const mapGroups: Record<string, any[]> = {};
    detailedMatches.forEach((m: any) => {
      const mapKey = m.mapName || 'Unknown';
      if (!mapGroups[mapKey]) mapGroups[mapKey] = [];
      mapGroups[mapKey].push(m);
    });
    const mapStatsList = Object.entries(mapGroups)
      .filter(([, matches]) => matches.length >= 2)
      .map(([mapName, matches]) => {
        const s = aggregateMatches(matches, lowerNickname, myAccountId);
        return {
          mapName,
          displayName: MAP_DISPLAY_NAMES[mapName] || mapName,
          matchCount: matches.length,
          avgDamage: Math.round(s.avgDamage),
          avgKills: Number(s.avgKills.toFixed(1)),
          avgDeathPhase: Number(s.avgDeathPhase.toFixed(1)),
        };
      })
      .sort((a, b) => b.avgDamage - a.avgDamage);
    const mapStatsResult = mapStatsList.length >= 2 ? {
      list: mapStatsList,
      bestMap: mapStatsList[0],
      worstMap: mapStatsList[mapStatsList.length - 1],
    } : null;

    const promptLines = [
      `당신들은 PUBG [${isSoloSquadFocus ? '극한의 솔로 챌린저' : (isCompetitiveFocus ? '프로급 경쟁전' : '일반전 전술')}] 분석 데스크의 전문 코치입니다. 전달받은 경기 데이터와 'Benchmark(엘리트 지표)'를 바탕으로 끝장 토론을 진행하십시오.`,
      isSoloSquadFocus
        ? "1. KIND COACH: 혼자서 다수를 상대하는 유저의 용기와 교전 능력을 극찬하십시오. 팀플레이 지표가 낮은 것은 당연한 것이니 무시하고, '고독한 사냥꾼'으로서의 면모를 부각하십시오."
        : "1. KIND COACH: 유저의 강점을 배지와 데이터를 근거로 칭찬하며, 벤치마크보다 우수한 지표를 강조하여 동기부여를 제공하십시오.",
      isSoloSquadFocus
        ? "2. SPICY BOMBER: 솔로 스쿼드라는 핑계 뒤에 숨은 피지컬의 한계를 지적하십시오. '혼자 들어갔으면 전멸을 시켰어야지', '기절만 시키고 확킬을 못 내는 것은 실력 부족'이라며 더 높은 화력을 요구하십시오."
        : `2. SPICY BOMBER: 유저의 지표가 상위권(엘리트) 지표보다 미달하는 부분을 냉혹하게 찌르십시오. ${isCompetitiveFocus ? '[경쟁전 룰셋]을 고려할 때 이 정도 수치는 팀에게 민폐 수준임을 강조하십시오.' : '[일반전] 데이터임을 감안해도 처참한 수준임을 강조하십시오.'} 수치 격차를 언급하며 유저의 전술적 오만을 꺾으십시오.`,
      "- [STRICT KOREAN] 모든 응답에서 'DUO', 'SQUAD', 'SOLO', 'Benchmark'와 같은 영문 용어를 절대 사용하지 마십시오. 반드시 '듀오', '스쿼드', '솔로', '상위권 지표' 또는 '벤치마크'와 같은 한글 용어로 대체하여 출력하십시오.",
      "- [ZERO HALLUCINATION] 데이터에 명시된 숫자를 1%의 오차도 없이 그대로 인용하십시오. 상위권 지표를 인용할 때는 반드시 정확한 소수점까지 포함하십시오.",
      "- [UTILITY LOGIC] 연막은 '구출 및 생존' 목적, 섬광/수류탄은 '적 무력화 및 살상' 목적으로 구분하여 분석하십시오. \"연막을 많이 썼는데 적 무력화 시간이 짧다\"와 같은 인과관계가 틀린 비판은 절대 금지합니다.",
      "- [DATA COMPARISON] 모든 피드백 항목에서 (내 수치 vs 상위권 수치) 형식을 사용하여 유저가 객관적인 실력 차이를 체감하게 하십시오. 수치 뒤에 반드시 '듀오', '스쿼드' 등 모드 명칭을 한글로 병기하십시오.",
      "- 모든 분석 용어는 유저가 이해하기 쉬운 한국어 게임 용어를 사용하십시오. (예: 십자포화 -> 양각 노출, 고립 -> 혼자 떨어짐, 화력 -> 딜량, 주도권 -> 먼저 때리기)",
      "- debateIssues는 반드시 3개를 작성하고, 각 issue의 userStats/benchmarkStats는 항목명(label)과 값이 완벽히 대칭되어야 합니다.",
      "반드시 아래 구조의 JSON 객체로만 응답하세요.",
      "{",
      '  "signature": "칭호", "signatureSub": "이유",',
      '  "debateIssues": [',
      '    {',
      '      "topic": "화력",',
      '      "question": "이 유저의 딜량은 충분한가?",',
      '      "spicyOpinion": "벤치마크 대비 부족한 이유 지적",',
      '      "kindOpinion": "강점 부각",',
      '      "winner": "kind|spicy|draw",',
      '      "reason": "판정 근거",',
      '      "evaluation": "종합 진단 1-2문장",',
      '      "userStats": [ { "label": "항목명(예: 평균 딜량, 연막 사용)", "value": "실제 수치" } ],',
      '      "benchmarkStats": [ { "label": "비교 항목명", "value": "상위권 수치" } ]',
      '    }',
      '  ],',
      '  "finalVerdict": "총평",',
      '  "actionItems": [ { "icon": "🎯", "title": "목표", "desc": "구체적인 실천 팁" } ]',
      "}"
    ];

    function getGoldenTimePattern(g: any): string {
      if (!g) return "데이터 부족";
      if (g.early > g.mid1 && g.early > g.mid2) return "핫드랍형 (초반 집중)";
      if (g.late > g.early && g.late > g.mid1) return "생존형 (후반 집중)";
      if (g.mid1 + g.mid2 > g.early + g.late) return "중반 교전형";
      return "균형형";
    }

    function selectDebateTopics(stats: any, bench: any): string[] {
      if (!stats || !bench) return ["화력", "교전 주도권", "포지셔닝"];
      const issues = [
        { topic: "화력", gap: Math.abs(stats.avgDamage - (bench.avgBaselineDamageFinal || 200)) / Math.max(bench.avgBaselineDamageFinal || 200, 1) },
        { topic: "교전 주도권", gap: Math.abs(stats.userInitiativeRate - (bench.avgRealInitiativeSuccessFinal || 40)) / 100 },
        { topic: "1:1 결정력", gap: Math.abs(stats.avgDuelWinRate - (bench.b_duelWinRate || 50)) / 100 },
        { topic: "유틸리티 활용", gap: stats.totalUtilityThrows < 5 ? 0.4 : 0.1 },
        { topic: "포지셔닝", gap: parseFloat(stats.avgIsolationStr) > 3.5 ? 0.35 : 0.05 },
        { topic: "아군 백업 속도", gap: Math.abs(parseFloat(stats.avgBackupLatency || "15") - (bench.b_tradeLatency || 12)) / 20 }
      ];
      return issues.sort((a, b) => b.gap - a.gap).slice(0, 3).map(i => i.topic);
    }

    let userPrompt = `- 분석 대상: 총 ${mLen}경기 (랭크 매치: ${rankedCount}판 포함)\n`;
    userPrompt += `- 주력 모드: ${mainModeName.toUpperCase()} (신뢰도: ${tierConfidence}, 기반: ${mainModeCount}판)\n`;

    if (goldenTimeAvg) {
      userPrompt += `\n### [전술 지표 분석]\n`;
      userPrompt += `- 교전 타이밍(GoldenTime): ${getGoldenTimePattern(goldenTimeAvg)}\n`;
      userPrompt += `- 평균 백업 속도(Trade): ${avgBackupLatency} (아군 기절 시 적 제압 시간)\n`;
      userPrompt += `- 대응 사격 속도(Reaction): ${avgReactionLatency} (피격 시 반격 시간)\n`;
      userPrompt += `- 유틸리티 활용: 총 투척 ${totalUtilityThrows}회 (연막 ${totalSmokes}회 사용, 섬광 ${totalStunCount}회 사용)\n`;
      userPrompt += `- 전술적 구출: 연막을 활용한 아군 구출 시도 ${totalSmokeCount}회 (성공: ${totalSmokeRescues}회)\n`;
    }

    const matchesForTrend = detailedMatches.slice(0, 10);
    if (matchesForTrend.length >= 6) {
      const recentMatches = matchesForTrend.slice(0, 5);
      const olderMatches = matchesForTrend.slice(5);
      const recentStats = aggregateMatches(recentMatches, lowerNickname, myAccountId);
      const olderStats = aggregateMatches(olderMatches, lowerNickname, myAccountId);
      if (recentStats && olderStats) {
        const dmgTrend = Math.round(recentStats.avgDamage - olderStats.avgDamage);
        const winTrend = Number((recentStats.avgDuelWinRate - olderStats.avgDuelWinRate).toFixed(1));
        userPrompt += `\n### [최근 트렌드 (최근 5판 vs 이전 5판)]\n`;
        userPrompt += `- 딜량 변화: ${Math.floor(olderStats.avgDamage)} → ${Math.floor(recentStats.avgDamage)} (${dmgTrend >= 0 ? '+' : ''}${dmgTrend})\n`;
        userPrompt += `- 교전 승률: ${olderStats.avgDuelWinRate}% → ${recentStats.avgDuelWinRate}% (${winTrend >= 0 ? '+' : ''}${winTrend}%)\n`;
        userPrompt += `- 종합 추세: ${dmgTrend > 50 ? '📈 실력 상승세' : dmgTrend < -50 ? '📉 컨디션 하락세' : '➡️ 안정권 유지'}\n`;
      }
    }

    let maxMatches = 0;
    let mainUserTier = "C";
    let mainBench: any = null;
    let finalTierBreakdown: any = null;

    for (const [mode, gMatches] of Object.entries(groups)) {
      if (gMatches.length === 0) continue;

      const gMatchIds = gMatches.map((m: any) => m.matchId || m.match_id || m.id).filter(Boolean);

      const combinedScores = gMatchIds.map((id, index) => {
        if (!id || typeof id !== 'string') return null;
        const normalizedId = id.includes(':') ? id.split(':').pop() : id;

        // 1. DB 벤치마크 매칭
        const dbBench = userBenchmarks?.find(b =>
          b.match_id === id || b.match_id === normalizedId
        );

        // 2. 실시간 분석 데이터 매칭 (Fallback 포함)
        const matchData = detailedMatches.find((m: any) => {
          // [V40.0] 매치 객체 내부 ID 또는 Map에 저장할 때 썼던 ID 모두 체크
          const mId = (m.matchId || m.match_id || m.id);
          const normalizedMId = mId?.includes(':') ? mId.split(':').pop() : mId;
          return mId === id || normalizedMId === normalizedId || normalizedMId === id || mId === normalizedId;
        });

        return {
          combat: (dbBench?.combat_score || matchData?.benchmark?.breakdown?.combat || 0),
          tactical: (dbBench?.tactical_score || matchData?.benchmark?.breakdown?.tactical || 0),
          survival: (dbBench?.survival_score || matchData?.benchmark?.breakdown?.survival || 0),
          score: (dbBench?.score || matchData?.benchmark?.score || 55)
        };
      }).filter(Boolean) as any[];

      const sortedScores = combinedScores.sort((a, b) => b.score - a.score);
      const topCount = Math.max(1, Math.ceil(sortedScores.length * 0.5));
      const topScores = sortedScores.slice(0, topCount);

      const validCombat = topScores.map(s => s.combat).filter(s => s > 0);
      const validTactical = topScores.map(s => s.tactical).filter(s => s > 0);
      const validSurvival = topScores.map(s => s.survival).filter(s => s > 0);
      const validScores = topScores.map(s => s.score);

      const avgScore = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 55;

      const avgBreakdown = {
        combat: validCombat.length > 0 ? Number((validCombat.reduce((a: any, b: any) => a + b, 0) / validCombat.length).toFixed(1)) : 0,
        tactical: validTactical.length > 0 ? Number((validTactical.reduce((a: any, b: any) => a + b, 0) / validTactical.length).toFixed(1)) : 0,
        survival: validSurvival.length > 0 ? Number((validSurvival.reduce((a: any, b: any) => a + b, 0) / validSurvival.length).toFixed(1)) : 0,
        total: Number(avgScore.toFixed(1))
      };

      const userTier = estimateUserTier(avgScore);
      const targetMatchType = rankedCount >= normalCount ? 'competitive' : 'official';
      const { data: globalStats } = await supabase.from("global_benchmarks")
        .select("*")
        .eq("tier", userTier)
        .ilike("game_mode", `%${mode}%`)
        .in("match_type", ['competitive', 'official']) // [V38.4] 비정상 매치(AI로얄 등) 원천 차단
        .limit(200);
      let bench: any = {
        avgRealPressureFinal: 1.5, avgBaselineDamageFinal: 450, avgRealInitiativeSuccessFinal: 55,
        b_isolationIndex: 1.0, b_minDist: 15, b_counterLatency: 0.5, b_tradeLatency: 12.0, b_soloKillRate: 50,
        b_reviveRate: 30, b_tradeRate: 35, b_reversalRate: 25, avgDeathPhaseElite: 6,
        b_smokeRate: 15, b_stunDuration: 1.0, b_avgSmokeCount: 5, // [V25] DB 부재 시 대비 최소한의 보수적 기준
        b_duelWinRate: userTier === 'S' ? 65 : userTier === 'A' ? 55 : userTier === 'B' ? 45 : 35
      };
      if (globalStats && globalStats.length >= 5) {
        const gLen = globalStats.length;
        bench = {
          avgRealPressureFinal: Number((globalStats.reduce((acc: any, s: any) => acc + (s.pressure_index || 0), 0) / gLen).toFixed(2)),
          avgBaselineDamageFinal: Math.round(globalStats.reduce((acc: any, s: any) => acc + (s.damage || 0), 0) / gLen),
          avgRealInitiativeSuccessFinal: Math.round(globalStats.reduce((acc: any, s: any) => acc + (s.initiative_rate || 0), 0) / gLen),
          b_isolationIndex: Number((globalStats.reduce((acc: any, s: any) => acc + (s.isolation_index || 0), 0) / gLen).toFixed(2)),
          b_minDist: Math.round(globalStats.reduce((acc: any, s: any) => acc + (s.min_dist || 0), 0) / gLen / (globalStats[0]?.min_dist > 5000 ? 100 : 1)),
          b_counterLatency: Number((globalStats.reduce((acc: any, s: any) => acc + (s.counter_latency_ms || 500), 0) / gLen / 1000).toFixed(2)),
          b_tradeLatency: Number((globalStats.reduce((acc: any, s: any) => acc + (s.trade_latency_ms || 12000), 0) / gLen / 1000).toFixed(2)),
          b_soloKillRate: Math.round(globalStats.reduce((acc: any, s: any) => acc + (s.solo_kill_rate || 0), 0) / gLen),
          b_reviveRate: Math.round(globalStats.reduce((acc: any, s: any) => acc + (s.revive_rate || 0), 0) / gLen),
          b_smokeRate: Number((globalStats.reduce((acc: any, s: any) => acc + (s.smoke_rate || 0), 0) / gLen).toFixed(1)),
          b_tradeRate: Math.round(globalStats.reduce((acc: any, s: any) => acc + (s.trade_rate || 0), 0) / gLen),
          b_reversalRate: Math.round(globalStats.reduce((acc: any, s: any) => acc + (s.reversal_rate || 0), 0) / gLen),
          b_avgSmokeCount: Number((globalStats.reduce((acc: any, s: any) => acc + (s.smoke_count || 0), 0) / gLen).toFixed(1)),
          b_stunDuration: Number((globalStats.reduce((acc: any, s: any) => acc + (s.stun_duration || 0), 0) / gLen).toFixed(1)),
          b_duelWinRate: Math.round(globalStats.reduce((acc: any, s: any) => acc + (s.duel_win_rate || (userTier === 'S' ? 65 : userTier === 'A' ? 55 : userTier === 'B' ? 45 : 35)), 0) / gLen),
          avgDeathPhaseElite: Number((globalStats.reduce((acc: any, s: any) => acc + (s.death_phase || 0), 0) / gLen).toFixed(1))
        };
      }
      if (gMatches.length > maxMatches) {
        maxMatches = gMatches.length;
        mainUserTier = userTier;
        mainBench = bench;
        finalTierBreakdown = avgBreakdown;
      }
      const isLow = gMatches.length <= 2;
      const gStats = aggregateMatches(gMatches, lowerNickname, myAccountId);
      userPrompt += `### [${mode.toUpperCase()} 모드 분석] (${gMatches.length}판${isLow ? ' - 참고용: 데이터 부족' : ''})\n`;
      userPrompt += `- 유저 티어: ${userTier}\n- 평균 화력: ${gStats.avgDamage} (동일 티어 Benchmark: ${bench.avgBaselineDamageFinal}), 평균 ${gStats.avgKills}킬\n- [선제 공격] 주도권 성공률: ${gStats.userInitiativeRate}% (Benchmark: ${bench.avgRealInitiativeSuccessFinal}%)\n`;
      const benchDuelWinRate = bench.b_duelWinRate || (userTier === 'S' ? 65 : userTier === 'A' ? 55 : userTier === 'B' ? 45 : 35);
      userPrompt += `- [교전 결정력] 1:1 교전 승률: ${gStats.avgDuelWinRate}% (Benchmark: ${benchDuelWinRate}%, 승리: ${gStats.totalDuelWins}회, 패배: ${gStats.totalDuelLosses}회, 역전승: ${gStats.totalReversalWins}회)\n- [교전 압박] 평균 압박 지수: ${gStats.avgPressureIndex} (Benchmark: ${bench.avgRealPressureFinal}), 최대 교전 거리: ${gStats.totalMaxHitDist}m\n`;
      if (mode !== 'solo') {
        const b_smokeRate = bench.b_smokeRate || 17.6;
        const b_stunDurationTotal = (bench.b_stunDuration || 1.5) * gStats.mLen;
        const b_smokeCountTotal = (bench.b_avgSmokeCount || 9.1) * gStats.mLen;
        userPrompt += `- [팀 기여도] 적 팀 전멸 기여: ${gStats.totalTeamWipes}회, 화력 집중(점사): ${gStats.totalFocusFireCount}회\n- [팀플레이] 아군 기절 ${gStats.totalTeammateKnocks}회 → 부활: ${gStats.totalRevCount}회, 복수(Trade): ${gStats.totalTradeKills}회 (복수 성공률: ${gStats.totalTeammateKnocks > 0 ? Math.round((gStats.totalTradeKills / gStats.totalTeammateKnocks) * 100) : 0}% vs 상위권: ${bench.b_tradeRate}%)\n- [전술 기여] 견제 지원율: ${gStats.totalTeammateKnocks > 0 ? Math.round((gStats.totalSuppCount / gStats.totalTeammateKnocks) * 100) : 0}%, 미끼: ${gStats.totalBaitCount}회, 연막 활용(구출시도/총사용): ${gStats.totalSmokeCount}/${gStats.itemUseSummary.smokes}회 (상위권 평균: ${b_smokeRate}% 구출 성공, 총 ${b_smokeCountTotal}회 사용), 섬광: ${gStats.totalStunCount}회 (적 무력화 시간: ${gStats.totalStunDuration.toFixed(1)}초 vs 상위권 타겟: ${b_stunDurationTotal.toFixed(1)}s)\n`;
      }
      userPrompt += `- [반응 속도] 대응 사격 속도: ${gStats.avgReactionLatency} (Benchmark: ${bench.b_counterLatency}s), 반격 성공률: ${gStats.totalReversalAttempts > 0 ? Math.round((gStats.totalReversalWins / gStats.totalReversalAttempts) * 100) : 0}%\n- [백업 속도] 아군 백업 속도: ${gStats.avgBackupLatency} (Benchmark: ${bench.b_tradeLatency}s)\n- [생존 환경] 고립 지수(운영/교전/사망): ${gStats.avgIsolationStr}/${gStats.isolationCountFinal > 0 ? (gStats.totalCombatIso / gStats.isolationCountFinal).toFixed(2) : "0"}/${gStats.isolationCountFinal > 0 ? (gStats.totalDeathIso / gStats.isolationCountFinal).toFixed(2) : "0"}, 양각 노출 상황: ${gStats.totalCrossfireExposureCount}회\n- [거리 관리] 팀원과의 평균 거리: ${gStats.avgMinDistStr}, 평균 고도차: ${gStats.avgHeightDiffStr}, 경기당 평균 거리별 데미지(근/중/원): ${gStats.avgDistanceDamage.short}/${gStats.avgDistanceDamage.mid}/${gStats.avgDistanceDamage.long}\n- [킬 분류] 솔로 킬: ${gStats.killContribFinal.solo}회, 클린업 킬: ${gStats.killContribFinal.cleanup}회 (솔로 비중: ${gStats.soloKillRate}% vs Benchmark: ${bench.b_soloKillRate}%)\n- [유틸리티] 총 투척 ${gStats.totalUtilityThrows}회, 적중 ${gStats.totalUtilityHits}회, 데미지 ${Math.round(gStats.totalUtilityDamage / gStats.mLen)} (평균)\n- [운영 패턴] 평균 사망 페이즈: ${gStats.avgDeathPhase} (Benchmark: ${bench.avgDeathPhaseElite}), 자기장 누적 피해: ${Math.round(gStats.totalBluezoneWaste / gStats.mLen)} HP, 엣지(Edge) 플레이: ${gStats.totalEdgePlay}회, 진입 지연: ${gStats.totalFatalDelay}회\n\n`;
    }

    if (mainBench) {
      const mainModeStats = aggregateMatches(groups[mainModeName] || [], lowerNickname, myAccountId);
      const autoTopics = selectDebateTopics(mainModeStats, mainBench);
      userPrompt += `\n### [분석 집중 영역 (Debate Issues)]\n반드시 아래 3개 주제를 순서대로 다루어 주십시오:\n${autoTopics.map((t, i) => `${i + 1}. ${t}`).join(', ')}\n`;
    }

    const mainModeStats = { ...aggregateMatches(groups[mainModeName] || [], lowerNickname, myAccountId), modeDistribution: { main: mainModeName } };
    const roleInfo = classifyRole(mainModeStats, mainBench, mainUserTier);
    userPrompt += `\n### [유저 전술적 정체성]\n- 부여된 칭호: ${roleInfo.title}\n- 전술 직업군: ${roleInfo.roleLabel}\n- 특징 요약: ${roleInfo.description}\n- 시그니처 무기: ${roleInfo.signatureWeapon} (${roleInfo.signatureWeaponStats?.kills}킬, ${roleInfo.signatureWeaponStats?.dbnos}기절)\n`;

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const modelsToTry = ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-2.5-flash"];
    let streamResult = null;
    let lastError = null;

    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
    ];

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: promptLines.join("\n"),
          generationConfig: { responseMimeType: "application/json", temperature: 0.75, maxOutputTokens: 3000 },
          safetySettings
        });
        streamResult = await model.generateContentStream(userPrompt);
        if (streamResult) break;
      } catch (err: any) {
        console.warn(`[AI-SUMMARY] Model ${modelName} failed, trying next...`, err.message);
        lastError = err;
      }
    }

    if (!streamResult) throw new Error(`모든 AI 모델 호출에 실패했습니다: ${lastError?.message}`);

    const reactionTier = (lat: string) => { const v = parseFloat(lat); return isNaN(v) ? "C" : v < 0.4 ? "S" : v < 0.6 ? "A" : v < 0.8 ? "B" : "C"; };
    const backupTier = (lat: string) => { const v = parseFloat(lat); return isNaN(v) ? "C" : v < 10 ? "S" : v < 14 ? "A" : v < 18 ? "B" : "C"; };

    const precomputedVisuals = {
      latestMatchTime, counterLatency: avgBackupLatency, reactionLatency: avgReactionLatency,
      reactionTier: reactionTier(avgReactionLatency), backupTier: backupTier(avgBackupLatency), overallTier: mainUserTier, roleInfo,
      tierBreakdown: finalTierBreakdown,
      initiativeSuccess: `${userInitiativeRate}%`, pressureIndex: avgPressureIndex,
      reversalRate: `${totalReversalAttempts > 0 ? Math.round((totalReversalWins / totalReversalAttempts) * 100) : 0}%`,
      duelStats: { winRate: `${avgDuelWinRate}%`, wins: totalDuelWins, losses: totalDuelLosses, reversals: totalReversalWins, reversalAttempts: totalReversalAttempts },
      teamImpact: { damageImpact: avgDamageImpact, topBadges },
      goldenTime: goldenTimeAvg, killContrib: killContribFinal, deathPhase: avgDeathPhase,
      bluezoneWaste: Math.round(totalBluezoneWaste / mLen),
      modeDistribution: { ranked: rankedCount, normal: normalCount, main: rankedCount >= normalCount ? "경쟁전" : "일반전" },
      tactical: {
        suppRate: totalTeammateKnocks > 0 ? Math.round((totalSuppCount / totalTeammateKnocks) * 100) + "%" : "0%",
        tradeRate: totalTeammateKnocks > 0 ? Math.round((totalTradeKills / totalTeammateKnocks) * 100) + "%" : "0%",
        smokeRate: totalTeammateKnocks > 0 ? Math.round((totalSmokeCount / totalTeammateKnocks) * 100) + "%" : "0%", // [V38.3.1] 성공(Rescues)이 아닌 시도(Count) 기준 변경
        reviveRate: totalTeammateKnocks > 0 ? Math.round((totalRevCount / totalTeammateKnocks) * 100) + "%" : "0%",
        counts: {
          knocks: totalTeammateKnocks,
          smokes: totalSmokeCount,
          smokeRescues: totalSmokeRescues,
          revives: totalRevCount,
          trades: totalTradeKills,
          supps: totalSuppCount,
          stuns: totalStunCount,
          stunDuration: Number(totalStunDuration.toFixed(1)),
          initiative: { attempts: totalInitiativeAttempts, success: totalInitiativeSuccess }
        },
        baitCount: totalBaitCount, isolation: isolationCountFinal > 0 ? {
          isolationIndex: Number((totalIsolationIndexFinal / isolationCountFinal).toFixed(1)),
          minDist: Math.round(totalMinDist / isolationCountFinal), heightDiff: Math.round(totalHeightDiff / isolationCountFinal),
          isCrossfire: totalCrossfireCount > 0, teammateCount: Math.round(totalTeammateCountFinal / isolationCountFinal),
          userTier: mainUserTier, benchmarkIsolationIndex: mainBench?.b_isolationIndex || 2.5, benchmarkMinDist: mainBench?.b_minDist || 15
        } : null
      },
      mapStats: mapStatsResult,
    };

    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
      async start(controller) {
        let fullText = "";
        try {
          controller.enqueue(encoder.encode(JSON.stringify({ type: "visuals", data: precomputedVisuals }) + "\n"));
          if (streamResult) { for await (const chunk of streamResult.stream) { const text = chunk.text(); fullText += text; controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk", data: text }) + "\n")); } }
          try {
            // [V41.0] 루프형 환각(중복 중괄호) 방지를 위한 강력한 JSON 추출 로직 도입
            const cleaned = fullText.trim().replace(/```json|```/g, "").trim();
            const validJsonString = extractValidJson(cleaned);
            
            const finalJson = JSON.parse(validJsonString);
            
            await supabase.from('ai_summaries').upsert({ 
              nickname: lowerNickname, 
              match_ids: matchIds.sort().join(','), 
              summary_json: finalJson, 
              updated_at: new Date().toISOString() 
            }, { onConflict: 'nickname,match_ids' });
            
            controller.enqueue(encoder.encode(JSON.stringify({ type: "done", valid: true }) + "\n"));
          } catch (jsonErr) {
            console.error("[AI-SUMMARY] JSON Parsing Failed. Attempting recovery...", jsonErr);
            controller.enqueue(encoder.encode(JSON.stringify({ type: "done", valid: false, raw: fullText }) + "\n"));
          }
        } catch (e: any) { controller.error(e); } finally { controller.close(); }
      }
    }), { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } });
  } catch (error: any) {
    console.error("[AI-SUMMARY] CRITICAL ERROR:", error.message || error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
