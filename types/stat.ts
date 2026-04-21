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
  team: MatchTeamMember[];
  totalTeamKills: number;
  totalTeamDamage: number;
  /** 텔레메트리 기반 킬 상세 (무기, 거리, 헤드샷 여부) */
  killDetails: KillDetail[];
  /** 텔레메트리 기반 기절 상세 */
  dbnoDetails: KillDetail[];
}
