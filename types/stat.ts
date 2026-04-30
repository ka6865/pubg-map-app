/**
 * @fileoverview 전적 검색 결과 및 개별 매치 내 플레이어의 통계를 나타내는 타입들을 정의합니다.
 */

export interface MatchStats {
  winPlace: number;
  kills: number;
  assists: number;
  damageDealt: number;
  timeSurvived: number;
  DBNOs: number;
  headshotKills: number;
  longestKill: number;
  heals: number;
  boosts: number;
  deathType: string;
  walkDistance: number;
  rideDistance: number;
  swimDistance: number;
  revives: number;
  name: string;
  playerId: string;
}

export interface MatchTeamMember {
  name: string;
  kills: number;
  assists: number;
  damageDealt: number;
  DBNOs: number;
  revives: number;
  deathType?: string;
  deaths?: number;
}

/** 텔레메트리 기반 킬 상세 정보 */
export interface KillDetail {
  type: "킬" | "기절";
  weapon: string;       // 한글 무기명
  weaponRaw: string;    // 원본 무기 코드 (디버그용)
  distanceM: number;    // 교전 거리 (m 단위)
  isHeadshot?: boolean; // 헤드샷 여부 (킬 이벤트)
  reason?: string;      // 피해 이유
  victimName: string;   // 피해자 닉네임
}

export interface MatchData {
  matchId: string;
  stats: MatchStats;
  mapName: string;
  createdAt: string;
  gameMode: string;
  matchType?: string;
  team: MatchTeamMember[];
  totalTeamKills: number;
  totalTeamDamage: number;
  /** 텔레메트리 기반 킬 상세 (무기, 거리, 헤드샷 여부) */
  killDetails: KillDetail[];
  /** 텔레메트리 기반 기절 상세 */
  dbnoDetails: KillDetail[];
  /** [V6.5] 팀 기여도 지표 */
  teamImpact?: {
    damageImpact: number;
    killImpact: number;
    totalTeamDamage: number;
    totalTeamKills: number;
  };
  /** [V6.5] 획득 배지 리스트 */
  badges?: Array<{
    id: string;
    name: string;
    desc: string;
  }>;
  /** [V3] 플레이어 순위 정보 (딜량 순위, 백분위, 킬 순위) */
  myRank?: {
    damageRank: number;
    damagePercentile: number;
    killRank: number;
    totalTeams?: number;
    totalPlayers?: number;
  };
  /** [V31] 전술적 몰살 여부 */
  teamWipeOccurred?: boolean;
  /** [V3] 교전 압박 지표 */
  combatPressure?: {
    totalHits: number;
    uniqueVictims: string[];
    maxHitDistance: number;
    utilityDamage: number;
    utilityHits: number;
  };
  /** [V3.0] 전술 지표 (견제, 세이브, 복수 등) */
  tradeStats?: {
    teammateKnocks: number;
    dangerousKnocks?: number;
    smokeOpps?: number;
    suppCount: number;
    smokeCount: number;
    teamSmokeCovered?: number;
    revCount: number;
    baitCount: number;
    tradeLatencyMs?: number;
    counterLatencyMs: number;
    reactionLatencyMs: number;
    coverRate: number;
    enemyTeamWipes?: number;
  };
  /** [V8.1] 공간 지능 지표 (고립 지수, 아군 거리 등) */
  isolationData?: {
    isolationIndex: number;
    minDist: number;
    heightDiff: number;
    isCrossfire: boolean;
    teammateCount: number;
  };
  /** [V31] 선제 타격 지표 */
  initiativeStats?: {
    total: number;
    success: number;
    rate: number;
  };
  /** [V31] 벤치마크 데이터 */
  eliteBenchmark?: {
    avgDamage: number;
    avgKills: number;
    realTradeLatency: number;
    realInitiativeSuccess: number;
    realDeathDistance: number;
    realReviveRate: number;
    realSmokeRate: number;
    realSuppCount?: number;
    realTeamWipes?: number;
    realUtilityCount?: number;
    realSurvivalTime?: number;
    realSoloKillRate?: number;
    realBurstDamage?: number;
  };
  /** [V3.0] 상세 전술 타임라인 */
  tacticalTimeline?: Array<{
    victim: string;
    distUserToTeammate: number;
    distUserToEnemy: number;
    heightDiff: number;
    hasSuppression: boolean;
    hasSmoke: boolean;
    hasRevive: boolean;
  }>;
  /** [V3] 골든타임 딜량 */
  goldenTimeDamage?: {
    early: number;
    mid1: number;
    mid2: number;
    late: number;
  };
  /** [V8.1] 선제 타격 성공률 (직접 필드) */
  initiative_rate?: number;
  v: number;
}
