CREATE TABLE IF NOT EXISTS public.board_write_rate_limits (
  scope text NOT NULL CHECK (scope IN ('post', 'comment')),
  actor_hash text NOT NULL CHECK (actor_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY (scope, actor_hash)
);

ALTER TABLE public.board_write_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS board_write_rate_limits_cleanup_idx
  ON public.board_write_rate_limits (window_started_at, scope, actor_hash);

REVOKE ALL ON TABLE public.board_write_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.board_write_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_board_write_quota(
  p_scope text,
  p_actor_hash text,
  p_window_seconds integer,
  p_limit integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  IF p_scope IS NULL
     OR p_actor_hash IS NULL
     OR p_window_seconds IS NULL
     OR p_limit IS NULL
     OR p_scope NOT IN ('post', 'comment')
     OR p_actor_hash !~ '^[a-f0-9]{64}$'
     OR p_window_seconds NOT BETWEEN 1 AND 3600
     OR p_limit NOT BETWEEN 1 AND 100 THEN
    RETURN false;
  END IF;

  INSERT INTO public.board_write_rate_limits AS current_limit (
    scope,
    actor_hash,
    window_started_at,
    request_count
  ) VALUES (
    p_scope,
    p_actor_hash,
    statement_timestamp(),
    1
  )
  ON CONFLICT (scope, actor_hash) DO UPDATE
  SET
    window_started_at = CASE
      WHEN current_limit.window_started_at
        <= statement_timestamp() - pg_catalog.make_interval(secs => p_window_seconds)
        THEN statement_timestamp()
      ELSE current_limit.window_started_at
    END,
    request_count = CASE
      WHEN current_limit.window_started_at
        <= statement_timestamp() - pg_catalog.make_interval(secs => p_window_seconds)
        THEN 1
      ELSE current_limit.request_count + 1
    END
  WHERE current_limit.window_started_at
      <= statement_timestamp() - pg_catalog.make_interval(secs => p_window_seconds)
     OR current_limit.request_count < p_limit
  RETURNING true INTO v_allowed;

  RETURN COALESCE(v_allowed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_board_write_quota(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_board_write_quota(text, text, integer, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_board_write_rate_limits(
  p_cutoff timestamptz,
  p_max_rows integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_deleted_rows integer;
BEGIN
  IF p_cutoff IS NULL
     OR p_max_rows IS NULL
     OR p_max_rows NOT BETWEEN 1 AND 5000
     OR p_cutoff > statement_timestamp() - interval '1 hour' THEN
    RETURN 0;
  END IF;

  WITH expired AS MATERIALIZED (
    SELECT scope, actor_hash
    FROM public.board_write_rate_limits
    WHERE window_started_at < p_cutoff
    ORDER BY window_started_at, scope, actor_hash
    LIMIT p_max_rows
  )
  DELETE FROM public.board_write_rate_limits AS target
  USING expired
  WHERE target.scope = expired.scope
    AND target.actor_hash = expired.actor_hash;

  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;
  RETURN v_deleted_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_board_write_rate_limits(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_board_write_rate_limits(timestamptz, integer)
  TO service_role;
