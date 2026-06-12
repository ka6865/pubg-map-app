-- Safely stabilize PUBG analysis identity keys without platform contamination.
-- Unknown historical rows are preserved as legacy_unknown instead of being
-- assumed to be steam.

ALTER TABLE public.processed_match_telemetry
  ADD COLUMN IF NOT EXISTS platform TEXT;

ALTER TABLE public.match_stats_raw
  ADD COLUMN IF NOT EXISTS platform TEXT;

ALTER TABLE public.global_benchmarks
  ADD COLUMN IF NOT EXISTS platform TEXT;

UPDATE public.processed_match_telemetry
SET platform = lower(trim(data #>> '{fullResult,platform}'))
WHERE lower(trim(data #>> '{fullResult,platform}')) IN ('steam', 'kakao');

UPDATE public.processed_match_telemetry
SET platform = 'legacy_unknown'
WHERE platform IS NULL
   OR trim(platform) = ''
   OR lower(trim(platform)) NOT IN ('steam', 'kakao', 'legacy_unknown');

WITH match_platforms AS (
  SELECT
    match_id,
    min(lower(trim(data #>> '{fullResult,platform}'))) AS inferred_platform
  FROM public.processed_match_telemetry
  WHERE lower(trim(data #>> '{fullResult,platform}')) IN ('steam', 'kakao')
  GROUP BY match_id
  HAVING count(DISTINCT lower(trim(data #>> '{fullResult,platform}'))) = 1
)
UPDATE public.match_stats_raw AS raw
SET platform = match_platforms.inferred_platform
FROM match_platforms
WHERE raw.match_id = match_platforms.match_id;

WITH match_platforms AS (
  SELECT
    match_id,
    min(lower(trim(data #>> '{fullResult,platform}'))) AS inferred_platform
  FROM public.processed_match_telemetry
  WHERE lower(trim(data #>> '{fullResult,platform}')) IN ('steam', 'kakao')
  GROUP BY match_id
  HAVING count(DISTINCT lower(trim(data #>> '{fullResult,platform}'))) = 1
)
UPDATE public.match_stats_raw AS raw
SET platform = 'legacy_unknown'
WHERE NOT EXISTS (
    SELECT 1
    FROM match_platforms
    WHERE match_platforms.match_id = raw.match_id
  )
  OR raw.platform IS NULL
  OR trim(raw.platform) = ''
  OR lower(trim(raw.platform)) NOT IN ('steam', 'kakao', 'legacy_unknown');

WITH match_platforms AS (
  SELECT
    match_id,
    min(lower(trim(data #>> '{fullResult,platform}'))) AS inferred_platform
  FROM public.processed_match_telemetry
  WHERE lower(trim(data #>> '{fullResult,platform}')) IN ('steam', 'kakao')
  GROUP BY match_id
  HAVING count(DISTINCT lower(trim(data #>> '{fullResult,platform}'))) = 1
)
UPDATE public.global_benchmarks AS benchmarks
SET platform = match_platforms.inferred_platform
FROM match_platforms
WHERE benchmarks.match_id = match_platforms.match_id;

WITH match_platforms AS (
  SELECT
    match_id,
    min(lower(trim(data #>> '{fullResult,platform}'))) AS inferred_platform
  FROM public.processed_match_telemetry
  WHERE lower(trim(data #>> '{fullResult,platform}')) IN ('steam', 'kakao')
  GROUP BY match_id
  HAVING count(DISTINCT lower(trim(data #>> '{fullResult,platform}'))) = 1
)
UPDATE public.global_benchmarks AS benchmarks
SET platform = 'legacy_unknown'
WHERE NOT EXISTS (
    SELECT 1
    FROM match_platforms
    WHERE match_platforms.match_id = benchmarks.match_id
  )
  OR benchmarks.platform IS NULL
  OR trim(benchmarks.platform) = ''
  OR lower(trim(benchmarks.platform)) NOT IN ('steam', 'kakao', 'legacy_unknown');

ALTER TABLE public.processed_match_telemetry
  ALTER COLUMN platform SET DEFAULT 'legacy_unknown',
  ALTER COLUMN platform SET NOT NULL;

ALTER TABLE public.match_stats_raw
  ALTER COLUMN platform SET DEFAULT 'legacy_unknown',
  ALTER COLUMN platform SET NOT NULL;

ALTER TABLE public.global_benchmarks
  ALTER COLUMN platform SET DEFAULT 'legacy_unknown',
  ALTER COLUMN platform SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.processed_match_telemetry
    GROUP BY match_id, platform, player_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'processed_match_telemetry identity duplicates detected';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.match_stats_raw
    GROUP BY match_id, platform, player_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'match_stats_raw identity duplicates detected';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.global_benchmarks
    GROUP BY match_id, platform, player_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'global_benchmarks identity duplicates detected';
  END IF;
END $$;

ALTER TABLE public.processed_match_telemetry
  DROP CONSTRAINT IF EXISTS processed_match_telemetry_pkey;

ALTER TABLE public.processed_match_telemetry
  ADD CONSTRAINT processed_match_telemetry_pkey
  PRIMARY KEY (match_id, platform, player_id);

ALTER TABLE public.match_stats_raw
  DROP CONSTRAINT IF EXISTS match_stats_raw_pkey;

ALTER TABLE public.match_stats_raw
  DROP CONSTRAINT IF EXISTS match_stats_raw_match_player_unique;

ALTER TABLE public.match_stats_raw
  ADD CONSTRAINT match_stats_raw_pkey
  PRIMARY KEY (match_id, platform, player_id);

DROP INDEX IF EXISTS public.match_stats_raw_match_id_player_id_key;

ALTER TABLE public.global_benchmarks
  DROP CONSTRAINT IF EXISTS unique_match_player;

DROP INDEX IF EXISTS public.unique_match_player;

CREATE UNIQUE INDEX IF NOT EXISTS global_benchmarks_match_platform_player_key
  ON public.global_benchmarks (match_id, platform, player_id);

CREATE INDEX IF NOT EXISTS idx_processed_match_telemetry_platform_player_updated
  ON public.processed_match_telemetry (platform, player_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_stats_raw_platform_player_created
  ON public.match_stats_raw (platform, player_id, created_at DESC);

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
