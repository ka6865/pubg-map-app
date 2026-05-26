-- Add clan_info column to posts table to store clan metadata as JSONB
ALTER TABLE public.posts ADD COLUMN clan_info jsonb;
