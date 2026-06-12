-- Remove the pre-platform unique key so match_stats_raw can store the same
-- match/player identity separately per platform.

ALTER TABLE public.match_stats_raw
  DROP CONSTRAINT IF EXISTS match_stats_raw_match_player_unique;
