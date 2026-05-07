/**
 * @fileoverview PUBG Telemetry Analysis Engine (V11.9.2 Modularized)
 * 
 * [Refactoring History]
 * - V11.9.2: Modularized into domain-specific handlers for better maintainability and zero-error policy.
 * - Units: Distance (m), Damage (HP), Latency (ms)
 */

import { normalizeName } from './utils';
import { AnalysisResult, InternalAnalysisState } from './types';
import { MAP_NAMES, RESULT_VERSION } from './constants';
import { CombatHandler } from './handlers/CombatHandler';
import { ZoneHandler } from './handlers/ZoneHandler';
import { UtilityHandler } from './handlers/UtilityHandler';
import { PositionHandler } from './handlers/PositionHandler';

export class AnalysisEngine {
  private state: InternalAnalysisState;
  private handlers: any[];

  constructor(
    nickname: string,
    teamNames: Set<string>,
    eliteNames: Set<string>,
    myRosterId: string
  ) {
    this.state = {
      lowerNickname: normalizeName(nickname),
      teamNames,
      eliteNames,
      myRosterId,
      matchStartTime: 0,
      playerCombatData: new Map(),
      victimDamage: new Map(),
      weaponStats: new Map(),
      playerLocations: new Map(),
      playerAliveStatus: new Map(),
      teamMapping: new Map(),
      teamAliveMembers: new Map(),
      myAttackEvents: new Set(),
      myDamageEvents: [],
      myReviveEvents: [],
      teammateKnockEvents: [],
      myActionTimestamps: [],
      totalIsolationSum: 0,
      isolationSampleCount: 0,
      totalMinDistSum: 0,
      totalHeightDiffSum: 0,
      totalNearbyTeammatesSum: 0,
      lastIsolationSampleTime: 0,
      dbnoIsolationSamples: [],
      deathIsolation: 0,
      totalCombatIsolationSum: 0,
      combatIsolationCount: 0,
      hasLanded: false,
      currentPhase: 0,
      totalTeammateKnocks: 0,
      totalSuppCount: 0,
      totalTradeKills: 0,
      totalSmokeCount: 0,
      totalBaitCount: 0,
      reactLatSum: 0,
      reactCount: 0,
      totalTimesHit: 0,
      totalCrossfireCount: 0,
      totalCoverAttempts: 0,
      totalCoverSuccess: 0,
      reactionLatencies: [],
      tradeLatencies: [],
      utilityTracker: new Map(),
      utilitySummary: { totalDamage: 0, hitCount: 0, killCount: 0, throwCount: 0, accuracy: 0, avgDamagePerThrow: 0 },
      dbnoMap: new Map(),
      totalPressureSum: 0,
      pressureSampleCount: 0,
      combatPressure: { totalHits: 0, uniqueVictims: new Set(), maxHitDistance: 0, utilityDamage: 0, utilityHits: 0, stunHits: 0, isClutched: false },
      myDownedIntervals: [],
      whiteZone: { x: 0, y: 0, radius: 0 },
      blueZone: { x: 0, y: 0, radius: 0 },
      isZoneMoving: false,
      wasZoneMovingAtDeath: false,
      zoneStrategy: { edgePlayCount: 0, fatalDelayCount: 0 },
      bluezoneWaste: 0,
      goldenTimeDamage: { early: 0, mid1: 0, mid2: 0, late: 0 },
      killContribution: { solo: 0, cleanup: 0 },
      wipedTeamsByUserParticipation: new Set(),
      teamsUserHit: new Set(),
      myRecentDamageTaken: new Map(),
      recentAttacksOnUser: [],
      itemUseSummary: { smokes: 0, frags: 0, molotovs: 0, stuns: 0, others: 0 },
      itemUseStats: { heals: 0, boosts: 0, throwCount: 0, lethalThrowCount: 0 },
      phaseTimeline: [],
      myDeathTime: null,
      deathDistance: 0,
      recentTeammateDamageTaken: new Map()
    };

    // 핸들러 주입
    this.handlers = [
      new CombatHandler(this.state),
      new ZoneHandler(this.state),
      new UtilityHandler(this.state),
      new PositionHandler(this.state)
    ];
  }

  public run(
    telemetry: any[],
    matchAttr: any,
    rosters: any[],
    participants: any[],
    myStats: any,
    teamStats: any[],
    eliteBenchmark: any
  ): AnalysisResult {
    // 1. 사전 매핑 구축
    this.buildMappings(rosters);

    // 2. 이벤트 루프
    const startTime = new Date(telemetry[0]?._D || 0).getTime();
    this.state.matchStartTime = startTime;

    telemetry.forEach(e => {
      const ts = new Date(e._D).getTime();
      const elapsed = ts - startTime;

      // 엔진 공통 상태 관리
      if (e._T === "LogPhaseStart") this.state.currentPhase = e.phase;

      // 도메인 핸들러에게 위임
      this.handlers.forEach(h => h.handleEvent(e, ts, elapsed));
    });

    // 3. 결과 조립
    return this.assembleResult(matchAttr, rosters, participants, myStats, teamStats, eliteBenchmark);
  }

  private buildMappings(rosters: any[]) {
    rosters.forEach(r => {
      const teamMates = new Set<string>();
      if (r.participants && Array.isArray(r.participants)) {
        r.participants.forEach((p: any) => {
          const name = normalizeName(p.name);
          this.state.teamMapping.set(name, r.id);
          teamMates.add(name);
        });
      }
      this.state.teamAliveMembers.set(r.id, teamMates);
    });
  }

  private assembleResult(matchAttr: any, rosters: any[], participants: any[], myStats: any, teamStats: any[], eliteBenchmark: any): AnalysisResult {
    const stats = Array.isArray(teamStats) ? teamStats : [];
    const totalTeamDamage = Math.max(1, stats.reduce((sum, s) => sum + (s?.damageDealt || 0), 0));
    const totalTeamKills = Math.max(1, stats.reduce((sum, s) => sum + (s?.kills || 0), 0));
    
    const damageImpact = Math.round((myStats.damageDealt / (eliteBenchmark?.avgDamage || 400)) * 100);
    const killImpact = Math.round((myStats.kills / (eliteBenchmark?.avgKills || 3)) * 100);
    const teamDamageShare = Math.round((myStats.damageDealt / totalTeamDamage) * 100);
    const teamKillShare = Math.round((myStats.kills / totalTeamKills) * 100);

    const badges = this.calculateBadges(myStats, teamStats, damageImpact / 100);

    // 지표 집계
    const avgIsolation = this.state.isolationSampleCount > 0 ? this.state.totalIsolationSum / this.state.isolationSampleCount : 0;
    const avgMinDist = this.state.isolationSampleCount > 0 ? this.state.totalMinDistSum / this.state.isolationSampleCount : 0;
    const avgHeightDiff = this.state.isolationSampleCount > 0 ? this.state.totalHeightDiffSum / this.state.isolationSampleCount : 0;
    const avgTeammateCount = this.state.isolationSampleCount > 0 ? this.state.totalNearbyTeammatesSum / this.state.isolationSampleCount : 0;

    const avgReactLat = this.state.reactCount > 0 ? this.state.reactLatSum / this.state.reactCount : 0;
    const avgTradeLat = this.state.tradeLatencies.length > 0 ? this.state.tradeLatencies.reduce((a, b) => a + b, 0) / this.state.tradeLatencies.length : 0;

    // 교전 및 선제 타격 지표 집계
    const pData = this.state.playerCombatData.get(this.state.lowerNickname) || { total: 0, success: 0, duelWins: 0, duelLosses: 0, reversalWins: 0, reversalAttempts: 0 };
    const duelWinRate = (pData.duelWins + pData.duelLosses) > 0 ? (pData.duelWins / (pData.duelWins + pData.duelLosses)) * 100 : 0;
    const reversalRate = pData.reversalAttempts > 0 ? (pData.reversalWins / pData.reversalAttempts) * 100 : 0;
    const initiativeRate = pData.total > 0 ? (pData.success / pData.total) * 100 : 0;

    return {
      matchId: matchAttr.id,
      v: RESULT_VERSION,
      processedAt: new Date().toISOString(),
      createdAt: matchAttr.createdAt,
      stats: myStats,
      team: teamStats,
      deathPhase: this.calculateDeathPhase(myStats.winPlace),
      mapName: MAP_NAMES[matchAttr.mapName] || matchAttr.mapName,
      gameMode: matchAttr.gameMode,
      matchType: matchAttr.matchType || "Official",
      totalTeams: rosters.length,
      totalPlayers: participants.length,
      teamImpact: { damageImpact, killImpact, teamDamageShare, teamKillShare, totalTeamDamage, totalTeamKills },
      badges,
      weaponStats: Object.fromEntries(this.state.weaponStats),
      zoneStrategy: this.state.zoneStrategy,
      goldenTimeDamage: this.state.goldenTimeDamage,
      killContribution: this.state.killContribution,
      itemUseStats: this.state.itemUseStats,
      wasZoneMovingAtDeath: this.state.wasZoneMovingAtDeath,
      isolationData: {
        isolationIndex: avgIsolation,
        combatIsolation: this.state.combatIsolationCount > 0 ? this.state.totalCombatIsolationSum / this.state.combatIsolationCount : avgIsolation,
        deathIsolation: this.state.deathIsolation || avgIsolation,
        minDist: avgMinDist,
        heightDiff: avgHeightDiff,
        isCrossfire: this.state.totalCrossfireCount > 0,
        teammateCount: avgTeammateCount
      },
      tradeStats: {
        teammateKnocks: this.state.totalTeammateKnocks,
        suppCount: this.state.totalSuppCount,
        tradeKills: this.state.totalTradeKills,
        smokeCount: this.state.totalSmokeCount,
        revCount: this.state.myReviveEvents.length,
        baitCount: this.state.totalBaitCount,
        tradeLatencyMs: avgTradeLat,
        counterLatencyMs: avgTradeLat,
        reactionLatencyMs: avgReactLat,
        coverRate: this.state.totalCoverAttempts > 0 ? (this.state.totalCoverSuccess / this.state.totalCoverAttempts) * 100 : 0,
        coverRateSampleCount: this.state.totalCoverAttempts,
        enemyTeamWipes: this.state.wipedTeamsByUserParticipation.size,
        tradeRate: this.state.totalTeammateKnocks > 0 ? (this.state.totalTradeKills / this.state.totalTeammateKnocks) * 100 : 0
      },
      initiative_rate: initiativeRate,
      initiativeSampleCount: pData.total,
      duelStats: { 
        totalDuels: pData.duelWins + pData.duelLosses, 
        wins: pData.duelWins, 
        losses: pData.duelLosses, 
        reversals: pData.reversalWins, 
        reversalAttempts: pData.reversalAttempts,
        reversalRate,
        duelWinRate 
      },
      combatPressure: {
        pressureScore: this.state.combatPressure.totalHits + (this.state.combatPressure.utilityHits * 2),
        pressureIndex: Number((this.state.combatPressure.totalHits / Math.max(5, (this.state.myActionTimestamps.length / 10))).toFixed(2)),
        utilityStats: { 
          throwCount: this.state.itemUseStats.throwCount,
          hitCount: this.state.combatPressure.utilityHits,
          totalDamage: this.state.combatPressure.utilityDamage,
          killCount: 0, // [V11.9.4] 유틸리티 킬 추적은 향후 고도화 예정
          accuracy: this.state.itemUseStats.lethalThrowCount > 0 ? Number(((this.state.combatPressure.utilityHits / this.state.itemUseStats.lethalThrowCount) * 100).toFixed(1)) : 0,
          avgDamagePerThrow: this.state.itemUseStats.lethalThrowCount > 0 ? Number((this.state.combatPressure.utilityDamage / this.state.itemUseStats.lethalThrowCount).toFixed(1)) : 0
        },
        isClutched: false,
        utilityDamage: this.state.combatPressure.utilityDamage,
        stunHits: this.state.combatPressure.stunHits,
        utilityHits: this.state.combatPressure.utilityHits,
        totalHits: this.state.combatPressure.totalHits,
        maxHitDist: this.state.combatPressure.maxHitDistance,
        uniqueVictims: Array.from(this.state.combatPressure.uniqueVictims)
      },
      eliteBenchmark,
      itemUseSummary: this.state.itemUseSummary,
      deathDistance: this.state.deathDistance,
      edgePlay: this.state.zoneStrategy.edgePlayCount,
      bluezoneWaste: this.state.bluezoneWaste
    };
  }

  private calculateDeathPhase(winPlace: number): number {
    if (winPlace <= 5) return 8;
    if (winPlace <= 15) return 6;
    if (winPlace <= 30) return 4;
    return 2;
  }

  private calculateBadges(myStats: any, teamStats: any[], impact: number) {
    const badges = [];
    if (myStats.kills >= 5) badges.push({ id: 'slayer', name: '슬레이어', desc: '한 매치에서 5킬 이상 달성' });
    if (impact >= 1.5) badges.push({ id: 'ace', name: '에이스', desc: '벤치마크 대비 150% 이상의 영향력' });
    if (this.state.bluezoneWaste > 100) badges.push({ id: 'survivor', name: '생존왕', desc: '자기장에서 100 HP 이상의 피해를 버티며 생존' });
    return badges;
  }
}
