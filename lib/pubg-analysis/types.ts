/**
 * PUBG 전술 분석 엔진 공용 타입 정의
 */

export interface Location {
  x: number;
  y: number;
  z: number;
}

export interface PlayerStats {
  name: string;
  kills: number;
  assists: number;
  damageDealt: number;
  winPlace: number;
  timeSurvived: number;
  DBNOs: number;
}

export interface UtilityStats {
  hitCount: number;
  throwCount: number;
  totalDamage: number;
  killCount: number;
  accuracy: number;
  avgDamagePerThrow: number;
  fragHits?: number;
  stunHits?: number;
  molotovHits?: number;
}

export interface CombatPressure {
  pressureScore: number;
  pressureIndex: number;
  utilityStats: UtilityStats;
  isClutched: boolean;
  utilityDamage?: number;
  stunHits?: number;
  utilityHits?: number;
  totalHits?: number;
  uniqueVictims?: string[];
  maxHitDist?: number;
}

export interface IsolationData {
  isolationIndex: number;
  combatIsolation: number;
  deathIsolation: number;
  minDist: number;
  heightDiff: number;
  isCrossfire: boolean;
  teammateCount: number;
}

export interface TradeStats {
  teammateKnocks: number;
  suppCount: number;
  tradeKills: number;
  smokeCount: number;
  revCount: number;
  baitCount: number;
  tradeLatencyMs: number;
  counterLatencyMs: number;
  reactionLatencyMs: number;
  coverRate: number;
  coverRateSampleCount: number;
  enemyTeamWipes: number;
  tradeRate?: number;
}

export interface DuelStats {
  totalDuels: number;
  wins: number;
  losses: number;
  reversals: number;
  reversalAttempts: number;
  reversalRate: number;
  duelWinRate: number;
}

export interface AnalysisResult {
  matchId: string;
  v: number;
  processedAt: string;
  createdAt: string;
  stats: PlayerStats;
  team: PlayerStats[];
  deathPhase: number;
  mapName: string;
  gameMode: string;
  matchType: string;
  totalTeams: number;
  totalPlayers: number;
  teamImpact: {
    damageImpact: number;
    killImpact: number;
    teamDamageShare: number;
    teamKillShare: number;
    totalTeamDamage: number;
    totalTeamKills: number;
  };
  badges: any[];
  weaponStats: Record<string, any>;
  zoneStrategy: {
    edgePlayCount: number;
    fatalDelayCount: number;
  };
  goldenTimeDamage: {
    early: number;
    mid1: number;
    mid2: number;
    late: number;
  };
  killContribution: {
    solo: number;
    cleanup: number;
  };
  itemUseStats: { heals: number, boosts: number, throwCount: number, lethalThrowCount: number }; // [V11.8] 회복/부스트 상세 통계
  wasZoneMovingAtDeath: boolean; // [V11.8] 사망 시점 자기장 상태
  isolationData: IsolationData;
  tradeStats: TradeStats;
  initiative_rate: number;
  initiativeSampleCount: number;
  duelStats: DuelStats;
  combatPressure: CombatPressure;
  eliteBenchmark: any;
  itemUseSummary: any;
  deathDistance: number;
  edgePlay?: number;
  bluezoneWaste?: number;
}

// 텔레메트리 이벤트 처리를 위한 내부 상태 타입
export interface InternalAnalysisState {
  lowerNickname: string;
  teamNames: Set<string>;
  eliteNames: Set<string>;
  myRosterId: string;
  matchStartTime: number;
  
  // 상황별 데이터 추적
  playerCombatData: Map<string, any>;
  victimDamage: Map<string, any>;
  weaponStats: Map<string, any>;
  playerLocations: Map<string, Location>;
  playerAliveStatus: Map<string, string | boolean>;
  teamMapping: Map<string, string>;
  teamAliveMembers: Map<string, Set<string>>;
  
  // 이벤트 큐/셋
  myAttackEvents: Set<number>;
  myDamageEvents: any[];
  myReviveEvents: any[];
  teammateKnockEvents: number[];
  myActionTimestamps: number[];
  
  // 지표용 누적 변수
  totalIsolationSum: number;
  isolationSampleCount: number;
  totalMinDistSum: number;
  totalHeightDiffSum: number;
  totalNearbyTeammatesSum: number;
  lastIsolationSampleTime: number;
  dbnoIsolationSamples: number[];
  deathIsolation: number;
  totalCombatIsolationSum: number;
  combatIsolationCount: number;
  hasLanded: boolean;
  currentPhase: number;
  
  totalTeammateKnocks: number;
  totalSuppCount: number;
  totalTradeKills: number;
  totalSmokeCount: number;
  totalBaitCount: number;
  
  reactLatSum: number;
  reactCount: number;
  totalTimesHit: number;
  totalCrossfireCount: number;
  totalCoverAttempts: number;
  totalCoverSuccess: number;
  
  reactionLatencies: number[];
  tradeLatencies: number[];
  
  // [V11.2] 신규 트래커
  utilityTracker: Map<number, any>;
  utilitySummary: any;
  
  // [V11.3] 정밀 트레이드용 dBNO 매핑
  // key: dBNOId, value: { attackerName, victimName, ts }
  dbnoMap: Map<string, { attacker: string, victim: string, ts: number, attackerName?: string, attackerAccountId?: string, time?: string }>;
  totalPressureSum: number;
  pressureSampleCount: number;
  combatPressure: {
    totalHits: number;
    uniqueVictims: Set<string>;
    maxHitDistance: number;
    utilityDamage: number;
    utilityHits: number;
    stunHits: number;
    isClutched: boolean;
  };
  myDownedIntervals: Array<{ start: number, end: number | null }>;
  whiteZone: { x: number, y: number, radius: number }; // [V11.8] 공식 문서 기준 White Zone
  blueZone: { x: number, y: number, radius: number };  // [V11.8] 공식 문서 기준 Blue Zone
  isZoneMoving: boolean; // [V11.8] 가이드 2 기준 자기장 수축 여부
  wasZoneMovingAtDeath: boolean; // [V11.8] 사망 시점 자기장 상태
  zoneStrategy: { edgePlayCount: number, fatalDelayCount: number };
  bluezoneWaste: number;
  goldenTimeDamage: { early: number, mid1: number, mid2: number, late: number };
  killContribution: { solo: number, cleanup: number };
  wipedTeamsByUserParticipation: Set<string>;
  teamsUserHit: Set<string>;
  myRecentDamageTaken: Map<string, number>;
  recentAttacksOnUser: any[];
  itemUseSummary: any;
  itemUseStats: { heals: number, boosts: number, throwCount: number, lethalThrowCount: number }; // [V11.8] 회복/부스트 상세 통계
  phaseTimeline: any[];
  myDeathTime: number | null;
  deathDistance: number;
  recentTeammateDamageTaken: Map<string, number>; // [V11.7] 미끼 플레이 추적용
  lastEdgeSampleTime?: number; // [V11.9.2] 끝선 플레이 샘플링 주기 관리
}
