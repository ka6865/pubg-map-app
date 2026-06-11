-- Stabilize PUBG analysis identity keys.
-- This migration does not delete contaminated historical rows. Application code
-- now ignores identity-mismatched processed cache rows and replaces them on
-- reanalysis.

ALTER TABLE public.processed_match_telemetry
  ADD COLUMN IF NOT EXISTS platform TEXT;

UPDATE public.processed_match_telemetry
SET platform = COALESCE(NULLIF(data #>> '{fullResult,platform}', ''), 'steam')
WHERE platform IS NULL OR platform = '';

ALTER TABLE public.processed_match_telemetry
  ALTER COLUMN platform SET DEFAULT 'steam',
  ALTER COLUMN platform SET NOT NULL;

ALTER TABLE public.match_stats_raw
  ADD COLUMN IF NOT EXISTS platform TEXT;

UPDATE public.match_stats_raw
SET platform = 'steam'
WHERE platform IS NULL OR platform = '';

ALTER TABLE public.match_stats_raw
  ALTER COLUMN platform SET DEFAULT 'steam',
  ALTER COLUMN platform SET NOT NULL;

ALTER TABLE public.global_benchmarks
  ADD COLUMN IF NOT EXISTS platform TEXT;

UPDATE public.global_benchmarks
SET platform = 'steam'
WHERE platform IS NULL OR platform = '';

ALTER TABLE public.global_benchmarks
  ALTER COLUMN platform SET DEFAULT 'steam',
  ALTER COLUMN platform SET NOT NULL;

ALTER TABLE public.processed_match_telemetry
  DROP CONSTRAINT IF EXISTS processed_match_telemetry_pkey;

ALTER TABLE public.processed_match_telemetry
  ADD CONSTRAINT processed_match_telemetry_pkey
  PRIMARY KEY (match_id, platform, player_id);

ALTER TABLE public.match_stats_raw
  DROP CONSTRAINT IF EXISTS match_stats_raw_pkey;

ALTER TABLE public.match_stats_raw
  ADD CONSTRAINT match_stats_raw_pkey
  PRIMARY KEY (match_id, platform, player_id);

DROP INDEX IF EXISTS public.match_stats_raw_match_id_player_id_key;
DROP INDEX IF EXISTS public.unique_match_player;
CREATE UNIQUE INDEX IF NOT EXISTS global_benchmarks_match_platform_player_key
  ON public.global_benchmarks (match_id, platform, player_id);

CREATE INDEX IF NOT EXISTS idx_processed_match_telemetry_platform_player_updated
  ON public.processed_match_telemetry (platform, player_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_global_benchmarks_platform_player_created
  ON public.global_benchmarks (platform, player_id, created_at DESC);

ALTER TABLE public.match_ai_coaching_cache
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

UPDATE public.match_ai_coaching_cache
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.match_ai_coaching_cache
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL,
  DROP CONSTRAINT IF EXISTS match_ai_coaching_cache_pkey;

ALTER TABLE public.match_ai_coaching_cache
  ADD CONSTRAINT match_ai_coaching_cache_pkey PRIMARY KEY (id);

ALTER TABLE public.player_ai_summary_cache
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

UPDATE public.player_ai_summary_cache
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.player_ai_summary_cache
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL,
  DROP CONSTRAINT IF EXISTS player_ai_summary_cache_pkey;

ALTER TABLE public.player_ai_summary_cache
  ADD CONSTRAINT player_ai_summary_cache_pkey PRIMARY KEY (id);

ALTER TABLE public.squad_ai_coaching_cache
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

UPDATE public.squad_ai_coaching_cache
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.squad_ai_coaching_cache
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL,
  DROP CONSTRAINT IF EXISTS squad_ai_coaching_cache_pkey;

ALTER TABLE public.squad_ai_coaching_cache
  ADD CONSTRAINT squad_ai_coaching_cache_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_match_ai_coaching_cache_identity_v2
  ON public.match_ai_coaching_cache (match_id, platform, player_id, coaching_style, prompt_version);

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_ai_summary_cache_identity_v2
  ON public.player_ai_summary_cache (player_id, platform, match_ids_hash, prompt_version);

CREATE UNIQUE INDEX IF NOT EXISTS idx_squad_ai_coaching_cache_identity_v2
  ON public.squad_ai_coaching_cache (player_id, platform, group_key, match_ids_hash, coaching_style, prompt_version);
