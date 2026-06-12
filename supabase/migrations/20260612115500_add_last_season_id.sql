-- migration: 20260612115500_add_last_season_id.sql
-- Description: pubg_player_cache 테이블에 누락된 last_season_id 및 seasons_list 컬럼 추가

ALTER TABLE pubg_player_cache
ADD COLUMN IF NOT EXISTS last_season_id text,
ADD COLUMN IF NOT EXISTS seasons_list jsonb;

COMMENT ON COLUMN pubg_player_cache.last_season_id IS '최종 검색/업데이트된 시즌 ID';
COMMENT ON COLUMN pubg_player_cache.seasons_list IS '플레이어 시즌 목록 정보 캐시 (JSON)';
