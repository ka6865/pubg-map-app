/**
 * @fileoverview 전적 검색 결과 및 개별 매치 내 플레이어의 통계를 나타내는 타입들을 정의합니다.
 */

export interface MatchStats {
  winPlace: number;
  kills: number;
  assists: number;
  damageDealt: number;
  timeSurvived: number;
}

export interface MatchTeamMember {
  name: string;
  kills: number;
  assists: number;
  damageDealt: number;
  DBNOs: number;
  revives: number;
  deaths?: number;
}

export interface MatchData {
  stats: MatchStats;
  mapName: string;
  createdAt: string;
  gameMode: string;
  team: MatchTeamMember[];
  totalTeamKills: number;
  totalTeamDamage: number;
}
