/**
 * @fileoverview PUBG Telemetry Analysis Engine (V11.9.2 Modularized)
 * 
 * [Refactoring History]
 * - V11.9.2: Modularized into domain-specific handlers for better maintainability and zero-error policy.
 * - Units: Distance (m), Damage (HP), Latency (ms)
 */

import { normalizeName } from './utils';
import { AnalysisResult, AnalysisState } from './types';
import { MAP_NAMES, RESULT_VERSION } from './constants';
import { CombatHandler } from './handlers/CombatHandler';
import { ZoneHandler } from './handlers/ZoneHandler';
import { UtilityHandler } from './handlers/UtilityHandler';
import { PositionHandler } from './handlers/PositionHandler';
import { MapReplayHandler } from './handlers/MapReplayHandler';
import { getBenchmarkTier } from './benchmarkScore';
import { MAP_SIZES } from './constants';

export class AnalysisEngine {
  private state: AnalysisState;
  private handlers: any[];

  constructor(
    nickname: string,
    myAccountId: string,
    teamNames: Set<string>,
    teamAccountIds: Set<string>,
    eliteNames: Set<string>,
    eliteAccountIds: Set<string>,
    myRosterId: string,
    mode: string = "lite"
  ) {
    this.state = {
      lowerNickname: normalizeName(nickname),
      canonicalNickname: nickname, // [V55.0] 정식 닉네임 저장
      myAccountId,
      teamNames,
      teamAccountIds,
      eliteNames,
      eliteAccountIds,
      myRosterId,
      mode,
      matchStartTime: 0,
      gameMode: "",
      playerCombatData: new Map(),
      victimDamage: new Map(),
      myVictimDamage: new Map(),
      weaponStats: new Map(),
      playerLocations: new Map(),
      playerAliveStatus: new Map(),
      teamMapping: new Map(),
      teamAliveMembers: new Map(),
      myAttackEvents: new Set(),
      myDamageEvents: [],
      totalReviveEvents: [],
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
      deathPhaseSnapshot: 0, // [BUG-FIX] 사망 순간 페이즈 고정
      totalTeammateKnocks: 0,
      myReviveCount: 0,
      totalSuppCount: 0,
      totalTradeKills: 0,
      totalSmokeCount: 0,
      totalSmokeRescues: 0,
      totalBaitCount: 0,
      baitCooldown: new Map(),
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
      combatPressure: { totalHits: 0, uniqueVictims: new Set(), maxHitDistance: 0, utilityDamage: 0, utilityHits: 0, isClutched: false },
      myDownedIntervals: [],
      whiteZone: { x: 0, y: 0, radius: 0 },
      blueZone: { x: 0, y: 0, radius: 0 },
      isZoneMoving: false,
      wasZoneMovingAtDeath: false,
      zoneStrategy: { edgePlayCount: 0, fatalDelayCount: 0 },
      bluezoneWaste: 0,
      goldenTimeDamage: { early: 0, mid1: 0, mid2: 0, late: 0 },
      killContribution: { solo: 0, cleanup: 0, assist: 0 },
      wipedTeamsByUserParticipation: new Set(),
      teamsUserHit: new Set(),
      myRecentDamageTaken: new Map(),
      recentAttacksOnUser: [],
      itemUseSummary: { smokes: 0, frags: 0, molotovs: 0, others: 0 },
      itemUseStats: {
        heals: 0, boosts: 0, throwCount: 0, lethalThrowCount: 0,
        focusFireCount: 0,
        crossfireExposureCount: 0,
        distanceDamage: { short: 0, mid: 0, long: 0 }
      },
      phaseTimeline: [],
      myDeathTime: null,
      deathDistance: 0,
      recentTeammateDamageTaken: new Map(),
      isolationData: { isolationIndex: 0, combatIsolation: 0, deathIsolation: 0, minDist: 0, heightDiff: 0, isCrossfire: false, teammateCount: 0 },
      timeline: [],

      // [V16.0] 신규 지표 초기화
      circleLuckSum: 0,
      circleLuckCount: 0,
      vehicleDistance: 0,
      weaponMatchCount: new Set(),

      // [V26.0] 리플레이 데이터 초기화
      mapName: "",
      mapSize: 819200,
      mapEvents: [],
      mapZoneEvents: [],
      lastPosByPlayer: new Map(),
      lastRotByPlayer: new Map(),
      groggyMap: new Map(),
      hasRealExplosions: false,
      positionEventCount: 0,
      matchEndRelativeTime: null,
      leadShotKills: 0,
      leadShotKnocks: 0,
      ridingShotKills: 0,
      ridingShotKnocks: 0,
      roadKills: 0,
      roadKnocks: 0,
      squadWeaponStats: new Map()
    };

    // 핸들러 주입
    this.handlers = [
      new CombatHandler(this.state),
      new ZoneHandler(this.state),
      new UtilityHandler(this.state),
      new PositionHandler(this.state),
      new MapReplayHandler(this.state)
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
    // 1. 사전 매핑 및 기본 정보 주입
    this.state.gameMode = matchAttr.gameMode || "";
    this.state.mapName = matchAttr.mapName || "Erangel";
    const mapKey = this.state.mapName.toLowerCase().split('_')[0];
    this.state.mapSize = MAP_SIZES[mapKey] || 819200;
    // Map coordinates normalization logic

    this.buildMappings(rosters, participants);

    // 2. 정확한 시작 시점 (LogMatchStart) 찾기
    const matchStartEv = telemetry.find(e => e._T === "LogMatchStart");
    const startTime = matchStartEv ? new Date(matchStartEv._D).getTime() : new Date(telemetry[0]?._D || 0).getTime();
    this.state.matchStartTime = startTime;

    // 3. 이벤트 루프

    telemetry.forEach(e => {
      const ts = new Date(e._D).getTime();
      const elapsed = ts - startTime;

      // 타임라인 기록 제한: 나 또는 아군 중 한 명이라도 살아있으면 계속 기록
      const isMyTeamAlive = Array.from(this.state.teamNames).some(name => this.state.playerAliveStatus.get(name) !== false);

      // [V26.1] 부활/복귀전 관련 이벤트는 전멸 상태라도 무조건 처리해야 함
      const eventType = e._T || "";
      const isRecallEvent = [
        "LogPlayerRevive", "LogPlayerRecall", "LogPlayerRecallShip",
        "LogPlayerRedeploy", "LogPlayerRedeployBRStart", "LogPlayerRedeployBrStart",
        "LogPlayerCreate"
      ].some(t => t.toLowerCase() === eventType.toLowerCase());

      const isAfterTeamWipe = !isMyTeamAlive && this.state.myDeathTime && ts > (this.state.myDeathTime + 30000);
      const isWin = e._T === "LogMatchEnd" && this.state.playerAliveStatus.get(this.state.lowerNickname) !== false;

      if (!isAfterTeamWipe || isWin || isRecallEvent) {
        // 엔진 공통 상태 관리 (타임라인 기록 포함)
        // [V58.0] 모든 이벤트에 포함된 common.isGame을 통해 실시간 페이즈 동기화 (가장 정확한 방식)
        const commonIsGame = e.common?.isGame ?? e.Common?.IsGame;
        if (commonIsGame !== undefined) {
          const phaseFromCommon = Math.floor(commonIsGame);
          if (phaseFromCommon > 0) {
            this.state.currentPhase = phaseFromCommon;
          }
        }

        if (e._T === "LogPhaseStart" || e._T === "LogPhaseChange") {
          const phaseNum = e.phase !== undefined ? e.phase : 0;
          if (this.state.currentPhase !== phaseNum && phaseNum > 0) {
            this.state.currentPhase = phaseNum;
            this.state.timeline.push({
              ts: ts - startTime,
              type: 'PHASE_START',
              phase: phaseNum
            });
          }
        }

        if (e._T === "LogMatchEnd") {
          this.state.matchEndRelativeTime = elapsed;
        }

        // 도메인 핸들러에게 위임
        this.handlers.forEach(h => h.handleEvent(e, ts, elapsed));
      } else {
        // 사망 이후라도 상태 업데이트는 필요할 수 있으므로 최소한의 핸들링만 수행 (타임라인 제외)
        // [BUG-FIX] 페이즈 업데이트는 하되, deathPhaseSnapshot은 절대 덮어쓰지 않음
        if (e._T === "LogPhaseStart" || e._T === "LogPhaseChange") {
          this.state.currentPhase = e.phase;
          // deathPhaseSnapshot은 최초 1회만 기록 (사망 직후 첫 PhaseChange 전까지의 값)
        }
      }
    });

    // 3. 결과 조립
    return this.assembleResult(matchAttr, rosters, participants, myStats, teamStats, eliteBenchmark);
  }

  private buildMappings(rosters: any[], participants: any[]) {
    rosters.forEach(r => {
      const teamMates = new Set<string>();
      const teamAccountIds = new Set<string>();
      let isMyTeam = false;

      const pRefs = r.relationships?.participants?.data;
      if (pRefs && Array.isArray(pRefs)) {
        pRefs.forEach((pRef: any) => {
          const fullPart = participants.find(part => part.id === pRef.id);
          const name = normalizeName(fullPart?.attributes?.stats?.name || "");
          const accountId = fullPart?.attributes?.stats?.playerId || fullPart?.attributes?.accountId;

          if (name) {
            this.state.teamMapping.set(name, r.id);
            teamMates.add(name);
          }
          if (accountId) {
            this.state.teamMapping.set(accountId, r.id);
            teamAccountIds.add(accountId);
          }

          if (accountId === this.state.myAccountId || name === this.state.lowerNickname) isMyTeam = true;
        });
      }

      this.state.teamAliveMembers.set(r.id, teamMates);

      if (isMyTeam) {
        this.state.myRosterId = r.id;
        this.state.teamNames = teamMates;
        this.state.teamAccountIds = teamAccountIds;
      }
    });
  }

  private assembleResult(matchAttr: any, rosters: any[], participants: any[], myStats: any, teamStats: any[], eliteBenchmark: any): AnalysisResult {
    // [V12.5] 승리 이벤트 추가
    if (myStats.winPlace === 1) {
      // 타임라인의 마지막 이벤트 시간 확인
      const lastEventTs = this.state.timeline.length > 0
        ? Math.max(...this.state.timeline.map(e => e.ts))
        : 0;

      const victoryTs = this.state.matchEndRelativeTime !== null
        ? this.state.matchEndRelativeTime
        : Math.max(myStats.timeSurvived * 1000, lastEventTs + 1000);

      this.state.timeline.push({
        ts: victoryTs,
        type: 'VICTORY'
      });
    }

    const stats = Array.isArray(teamStats) ? teamStats : [];
    const totalTeamDamage = Math.max(1, stats.reduce((sum, s) => sum + (s?.damageDealt || 0), 0));
    const totalTeamKills = Math.max(1, stats.reduce((sum, s) => sum + (s?.kills || 0), 0));

    const humanParticipants = participants.filter((p: any) => !p.attributes?.accountId?.startsWith("ai."));
    const sortedByDamage = [...humanParticipants].map(p => p.attributes?.stats).filter(Boolean).sort((a, b) => b.damageDealt - a.damageDealt);
    const damageRank = sortedByDamage.findIndex((s: any) => normalizeName(s.name) === this.state.lowerNickname) + 1 || 1;

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

    const avgReactLat = this.state.reactCount > 0 ? this.state.reactLatSum / this.state.reactCount : -1;
    const avgTradeLat = this.state.tradeLatencies.length > 0 ? this.state.tradeLatencies.reduce((a, b) => a + b, 0) / this.state.tradeLatencies.length : -1;

    // 교전 및 선제 타격 지표 집계
    const pData = (this.state.playerCombatData.get(this.state.myAccountId) || this.state.playerCombatData.get(this.state.lowerNickname)) || { total: 0, success: 0, duelWins: 0, duelLosses: 0, reversalWins: 0, reversalAttempts: 0 };
    const duelWinRate = (pData.duelWins + pData.duelLosses) > 0 ? (pData.duelWins / (pData.duelWins + pData.duelLosses)) * 100 : 0;
    const reversalRate = pData.reversalAttempts > 0 ? (pData.reversalWins / pData.reversalAttempts) * 100 : 0;
    const initiativeRate = pData.total > 0 ? (pData.success / pData.total) * 100 : -1;

    // weaponStats 맵에 최종 저장된 순수 유효 대인 딜량의 총합을 계산하여 총 딜량 정합성을 일치화함
    let processedDamageDealt = 0;
    for (const [_, wStat] of this.state.weaponStats.entries()) {
      processedDamageDealt += wStat.damage || 0;
    }
    processedDamageDealt = Math.round(processedDamageDealt);

    return {
      matchId: matchAttr.id,
      v: RESULT_VERSION,
      processedAt: new Date().toISOString(),
      createdAt: matchAttr.createdAt,
      stats: {
        ...myStats,
        damageDealt: processedDamageDealt,
        kills: myStats.kills ?? 0,
        winPlace: myStats.winPlace ?? 100,
        timeSurvived: myStats.timeSurvived ?? 0
      },
      team: teamStats,
      deathPhase: this.state.deathPhaseSnapshot || this.state.currentPhase,
      mapName: MAP_NAMES[matchAttr.mapName] || matchAttr.mapName,
      gameMode: matchAttr.gameMode,
      matchType: matchAttr.matchType || "Official",
      totalTeams: rosters.filter(r => r.relationships?.participants?.data?.length > 0).length,
      totalPlayers: participants.length,
      teamImpact: { damageImpact, killImpact, teamDamageShare, teamKillShare, totalTeamDamage, totalTeamKills },
      badges,
      weaponStats: Object.fromEntries(this.state.weaponStats),
      squadWeaponStats: Array.from(this.state.squadWeaponStats.entries()).reduce((acc, [sName, wMap]) => {
        const wArray = Array.from(wMap.values()) as any[];
        wArray.forEach((w: any) => {
          if (w.shots && w.shots > 0) {
            w.accuracy = Math.round((w.hits / w.shots) * 100);
          } else {
            w.accuracy = 0; // We might not track shots for teammates
          }
        });
        wArray.sort((a: any, b: any) => b.damage - a.damage);
        acc[sName] = wArray;
        return acc;
      }, {} as Record<string, any[]>),
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
        smokeRescues: this.state.totalSmokeRescues,
        revCount: this.state.myReviveCount,
        baitCount: this.state.totalBaitCount,
        tradeLatencyMs: avgTradeLat,
        counterLatencyMs: avgReactLat,
        reactionLatencyMs: avgReactLat,
        coverRate: this.state.totalCoverAttempts > 0 ? (this.state.totalCoverSuccess / this.state.totalCoverAttempts) * 100 : 0,
        coverRateSampleCount: this.state.totalCoverAttempts,
        enemyTeamWipes: this.state.wipedTeamsByUserParticipation.size,
        tradeRate: this.state.totalTeammateKnocks > 0 ? (this.state.totalTradeKills / this.state.totalTeammateKnocks) * 100 : 0,
        suppRate: this.state.totalTeammateKnocks > 0 ? (this.state.totalSuppCount / this.state.totalTeammateKnocks) * 100 : 0
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
          accuracyRaw: this.state.itemUseStats.lethalThrowCount > 0 ? (this.state.combatPressure.utilityHits / this.state.itemUseStats.lethalThrowCount) : 0,
          avgDamagePerThrow: this.state.itemUseStats.lethalThrowCount > 0 ? Number((this.state.combatPressure.utilityDamage / this.state.itemUseStats.lethalThrowCount).toFixed(1)) : 0
        },
        isClutched: false,
        utilityDamage: this.state.combatPressure.utilityDamage,
        utilityHits: this.state.combatPressure.utilityHits,
        totalHits: this.state.combatPressure.totalHits,
        maxHitDist: this.state.combatPressure.maxHitDistance,
        uniqueVictims: Array.from(this.state.combatPressure.uniqueVictims)
      },
      eliteBenchmark,
      itemUseSummary: this.state.itemUseSummary,
      deathDistance: this.state.deathDistance,
      edgePlay: this.state.zoneStrategy.edgePlayCount,
      bluezoneWaste: this.state.bluezoneWaste,

      // [V16.0] 신규 지표 반영
      avgCircleLuck: this.state.circleLuckCount > 0 ? Math.round((this.state.circleLuckSum / this.state.circleLuckCount) * 100) : 50,
      avgVehicleMastery: Math.min(100, Math.round((this.state.vehicleDistance / 5000) * 100)), // 5km 이동 시 만점
      weaponMatchCount: Array.from(this.state.weaponMatchCount),
      leadShotKills: this.state.leadShotKills,
      leadShotKnocks: this.state.leadShotKnocks,
      ridingShotKills: this.state.ridingShotKills,
      ridingShotKnocks: this.state.ridingShotKnocks,
      roadKills: this.state.roadKills,
      roadKnocks: this.state.roadKnocks,

      benchmark: getBenchmarkTier({
        rankPct: damageRank / Math.max(1, humanParticipants.length),
        survivalTime: myStats.timeSurvived || 0,
        initiativeRate: initiativeRate,
        counterLatencyMs: avgReactLat,
        pressureIndex: Number((this.state.combatPressure.totalHits / Math.max(5, (this.state.myActionTimestamps.length / 10))).toFixed(2)),
        smokeRate: this.state.totalTeammateKnocks > 0 ? (this.state.totalSmokeRescues / this.state.totalTeammateKnocks) * 100 : 0,
        suppCount: this.state.totalSuppCount,
        reviveRate: this.state.totalTeammateKnocks > 0 ? (this.state.myReviveCount / this.state.totalTeammateKnocks) * 100 : 0,
        tradeRate: this.state.totalTeammateKnocks > 0 ? (this.state.totalTradeKills / this.state.totalTeammateKnocks) * 100 : 0,
        teamWipes: this.state.wipedTeamsByUserParticipation.size,
        reversalRate: reversalRate,
        deathPhase: this.state.deathPhaseSnapshot || this.state.currentPhase,
        suppRate: this.state.totalTeammateKnocks > 0 ? (this.state.totalSuppCount / this.state.totalTeammateKnocks) * 100 : 0
      }, (this.state.gameMode || "").includes("solo")),
      isValidBenchmark: (myStats.timeSurvived || 0) >= 300,
      timeline: this.state.timeline.sort((a, b) => a.ts - b.ts),
      // [V26.0] 지도 리플레이용 데이터 포함
      mapData: {
        events: this.state.mapEvents,
        zoneEvents: this.state.mapZoneEvents,
        teammates: Array.from(this.state.teamAccountIds),
        teamNames: Array.from(this.state.teamNames)
      }
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