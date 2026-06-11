alter table if exists public.analytics_events
  add column if not exists client_environment text,
  add column if not exists source_host text,
  add column if not exists is_internal boolean not null default false;

create index if not exists analytics_events_internal_created_at_idx
  on public.analytics_events (is_internal, created_at desc);

create index if not exists analytics_events_source_host_created_at_idx
  on public.analytics_events (source_host, created_at desc)
  where source_host is not null;

comment on column public.analytics_events.client_environment is
  'Client-side execution environment reported by the analytics mirror. Used to distinguish production events from local/dev traffic.';

comment on column public.analytics_events.source_host is
  'Hostname that produced the mirrored analytics event. Used by Admin Agent to audit local or preview traffic contamination.';

comment on column public.analytics_events.is_internal is
  'True for local/dev/internal diagnostics when such events are explicitly accepted. Normal production analytics should remain false.';
