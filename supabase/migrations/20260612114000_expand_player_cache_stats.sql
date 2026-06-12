-- migration: 20260612114000_expand_player_cache_stats.sql
-- Description: pubg_player_cache 테이블에 플레이어별 전적 요약(season_stats_data) 및 최근 매치 ID 목록(recent_match_ids) 캐싱 컬럼 추가

ALTER TABLE pubg_player_cache
ADD COLUMN IF NOT EXISTS season_stats_data jsonb,
ADD COLUMN IF NOT EXISTS recent_match_ids jsonb;

COMMENT ON COLUMN pubg_player_cache.season_stats_data IS '시즌별 랭크 및 일반전 통계 요약 데이터 (JSON)';
COMMENT ON COLUMN pubg_player_cache.recent_match_ids IS '플레이어의 최근 20경기 매치 ID 목록 (JSON Array)';
