CREATE TABLE IF NOT EXISTS public.match_ai_coaching_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'steam',
  player_id TEXT NOT NULL,
  coaching_style TEXT NOT NULL DEFAULT 'spicy',
  prompt_version TEXT NOT NULL DEFAULT 'legacy',
  ai_result JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.player_ai_summary_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'steam',
  match_ids_hash TEXT NOT NULL,
  prompt_version TEXT NOT NULL DEFAULT 'legacy',
  ai_result JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.squad_ai_coaching_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'steam',
  group_key TEXT NOT NULL,
  match_ids_hash TEXT NOT NULL,
  coaching_style TEXT NOT NULL DEFAULT 'spicy',
  prompt_version TEXT NOT NULL DEFAULT 'legacy',
  ai_result JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.match_ai_coaching_cache
  ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'steam',
  ADD COLUMN IF NOT EXISTS player_id TEXT,
  ADD COLUMN IF NOT EXISTS prompt_version TEXT DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

ALTER TABLE public.player_ai_summary_cache
  ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'steam',
  ADD COLUMN IF NOT EXISTS prompt_version TEXT DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

ALTER TABLE public.squad_ai_coaching_cache
  ADD COLUMN IF NOT EXISTS player_id TEXT,
  ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'steam',
  ADD COLUMN IF NOT EXISTS prompt_version TEXT DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

UPDATE public.match_ai_coaching_cache
SET platform = COALESCE(platform, 'steam'),
    prompt_version = COALESCE(prompt_version, 'legacy'),
    updated_at = COALESCE(updated_at, created_at, timezone('utc'::text, now()));

UPDATE public.player_ai_summary_cache
SET platform = COALESCE(platform, 'steam'),
    prompt_version = COALESCE(prompt_version, 'legacy'),
    updated_at = COALESCE(updated_at, created_at, timezone('utc'::text, now()));

UPDATE public.squad_ai_coaching_cache
SET platform = COALESCE(platform, 'steam'),
    prompt_version = COALESCE(prompt_version, 'legacy'),
    updated_at = COALESCE(updated_at, created_at, timezone('utc'::text, now()));

ALTER TABLE public.match_ai_coaching_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_ai_summary_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.squad_ai_coaching_cache ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_match_ai_coaching_cache_identity_v2
  ON public.match_ai_coaching_cache (match_id, platform, player_id, coaching_style, prompt_version);

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_ai_summary_cache_identity_v2
  ON public.player_ai_summary_cache (player_id, platform, match_ids_hash, prompt_version);

CREATE UNIQUE INDEX IF NOT EXISTS idx_squad_ai_coaching_cache_identity_v2
  ON public.squad_ai_coaching_cache (player_id, platform, group_key, match_ids_hash, coaching_style, prompt_version);

CREATE INDEX IF NOT EXISTS idx_match_ai_coaching_cache_created_at
  ON public.match_ai_coaching_cache (created_at);

CREATE INDEX IF NOT EXISTS idx_player_ai_summary_cache_created_at
  ON public.player_ai_summary_cache (created_at);

CREATE INDEX IF NOT EXISTS idx_squad_ai_coaching_cache_created_at
  ON public.squad_ai_coaching_cache (created_at);
