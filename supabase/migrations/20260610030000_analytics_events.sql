-- Supabase analytics mirror for Admin Agent traffic summaries.
-- Raw events are intended for 90-day retention. Cleanup can be wired into
-- the existing GitHub Actions daily task later.

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id uuid references auth.users(id) on delete set null,
  session_id text not null,
  page_path text not null,
  page_title text,
  referrer_path text,
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  event_date date generated always as ((created_at at time zone 'Asia/Seoul')::date) stored,
  constraint analytics_events_event_name_check check (
    event_name in (
      'page_view',
      'stats_searched',
      'battle_started',
      'battle_completed',
      'share_clicked',
      'squad_synergy_completed',
      'ai_squad_coaching_requested',
      'ai_analysis_opened',
      'replay_2d_opened',
      'tab_clicked',
      'map_viewed',
      'weapon_viewed',
      'feature_consumption',
      'crate_opened',
      'board_viewed',
      'post_viewed',
      'post_action'
    )
  )
);

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);

create index if not exists analytics_events_event_date_name_idx
  on public.analytics_events (event_date, event_name);

create index if not exists analytics_events_event_date_page_path_idx
  on public.analytics_events (event_date, page_path);

create index if not exists analytics_events_session_created_at_idx
  on public.analytics_events (session_id, created_at desc);

create index if not exists analytics_events_user_created_at_idx
  on public.analytics_events (user_id, created_at desc)
  where user_id is not null;

create index if not exists analytics_events_params_gin_idx
  on public.analytics_events using gin (params);

alter table public.analytics_events enable row level security;
