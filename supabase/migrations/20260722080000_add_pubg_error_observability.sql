ALTER TABLE public.pubg_api_errors
  ADD COLUMN IF NOT EXISTS failure_stage text,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS upstream_status integer,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS client_kind text,
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS match_fingerprint text,
  ADD COLUMN IF NOT EXISTS nickname_fingerprint text;

CREATE INDEX IF NOT EXISTS pubg_api_errors_created_at_idx
  ON public.pubg_api_errors (created_at DESC);

CREATE INDEX IF NOT EXISTS pubg_api_errors_diagnosis_idx
  ON public.pubg_api_errors (error_code, failure_stage, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pubg_api_alert_deliveries (
  alert_key text NOT NULL,
  window_started_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (alert_key, window_started_at)
);

ALTER TABLE public.pubg_api_alert_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pubg_api_alert_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.pubg_api_alert_deliveries TO service_role;
