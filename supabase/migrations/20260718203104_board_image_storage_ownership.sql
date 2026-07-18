CREATE TABLE IF NOT EXISTS public.board_image_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  storage_key text NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('pending', 'ready', 'delete_pending', 'deleting', 'deleted', 'legacy_retained')),
  expected_mime_type text,
  max_bytes bigint CHECK (max_bytes IS NULL OR (max_bytes > 0 AND max_bytes <= 1572864)),
  expires_at timestamptz,
  delete_after timestamptz,
  delete_lease_until timestamptz,
  delete_lease_token uuid,
  delete_attempts integer NOT NULL DEFAULT 0 CHECK (delete_attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, storage_key)
);

CREATE TABLE IF NOT EXISTS public.board_post_image_refs (
  post_id bigint NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  image_id uuid NOT NULL REFERENCES public.board_image_objects(id) ON DELETE CASCADE,
  usage text NOT NULL CHECK (usage IN ('content', 'thumbnail')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, image_id, usage)
);

CREATE INDEX IF NOT EXISTS board_post_image_refs_image_id_idx
  ON public.board_post_image_refs (image_id);
CREATE INDEX IF NOT EXISTS board_image_objects_claim_idx
  ON public.board_image_objects (status, delete_after, delete_lease_until, expires_at, id)
  WHERE status IN ('pending', 'delete_pending', 'deleting');

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.board_image_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_post_image_refs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.board_image_objects, public.board_post_image_refs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.board_image_objects, public.board_post_image_refs TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('board-images-v2', 'board-images-v2', true, 1572864, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Authenticated Users Insert" ON storage.objects;
DROP POLICY IF EXISTS "Delete Policy" ON storage.objects;

CREATE OR REPLACE FUNCTION public.reserve_board_image_upload(
  p_owner_user_id uuid, p_expected_mime_type text, p_max_bytes bigint
)
RETURNS TABLE(image_id uuid, bucket_id text, storage_key text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_image_id uuid := gen_random_uuid();
BEGIN
  IF p_owner_user_id IS NULL OR p_expected_mime_type NOT IN ('image/png', 'image/jpeg', 'image/webp')
    OR p_max_bytes IS NULL OR p_max_bytes <= 0 OR p_max_bytes > 1572864 THEN
    RAISE EXCEPTION 'invalid_board_image_reservation';
  END IF;

  INSERT INTO public.board_image_objects (
    id, bucket_id, storage_key, owner_user_id, status, expected_mime_type, max_bytes, expires_at
  ) VALUES (
    v_image_id, 'board-images-v2', v_image_id::text, p_owner_user_id, 'pending',
    p_expected_mime_type, p_max_bytes, now() + interval '24 hours'
  );
  RETURN QUERY SELECT v_image_id, 'board-images-v2'::text, v_image_id::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_board_image_upload(
  p_image_id uuid, p_owner_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_image public.board_image_objects%ROWTYPE;
  v_mime_type text;
  v_size bigint;
BEGIN
  SELECT image_row.* INTO v_image
  FROM public.board_image_objects AS image_row
  WHERE image_row.id = p_image_id AND image_row.owner_user_id = p_owner_user_id
    AND image_row.status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT storage_object.metadata ->> 'mimetype', (storage_object.metadata ->> 'size')::bigint
  INTO v_mime_type, v_size
  FROM storage.objects AS storage_object
  WHERE storage_object.bucket_id = v_image.bucket_id AND storage_object.name = v_image.storage_key;
  IF NOT FOUND OR v_mime_type IS DISTINCT FROM v_image.expected_mime_type
    OR v_size IS NULL OR v_size > v_image.max_bytes THEN RETURN false; END IF;

  UPDATE public.board_image_objects AS image_row
  SET status = 'ready', expires_at = NULL, updated_at = now()
  WHERE image_row.id = v_image.id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.write_board_post_with_images(
  p_post_id bigint, p_actor_user_id uuid, p_expected_revision bigint, p_title text, p_content text,
  p_category text, p_image_url text, p_is_notice boolean, p_author text, p_user_id uuid,
  p_password_hash text, p_ip_address text, p_discord_url text, p_discord_channel_id text,
  p_clan_info jsonb, p_content_image_ids uuid[], p_thumbnail_image_id uuid
)
RETURNS TABLE(result_code text, post_id bigint, revision bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_post public.posts%ROWTYPE;
  v_new_post_id bigint;
  v_old_image_ids uuid[];
  v_requested_image_ids uuid[];
  v_image_id uuid;
BEGIN
  IF p_post_id IS NOT NULL THEN
    SELECT post_row.* INTO v_post
    FROM public.posts AS post_row WHERE post_row.id = p_post_id FOR UPDATE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text, NULL::bigint, NULL::bigint; RETURN; END IF;
    IF v_post.revision <> p_expected_revision THEN
      RETURN QUERY SELECT 'revision_conflict'::text, v_post.id, v_post.revision; RETURN;
    END IF;
    IF p_actor_user_id IS NULL OR (v_post.user_id IS DISTINCT FROM p_actor_user_id AND NOT EXISTS (
      SELECT 1 FROM public.profiles AS profile_row
      WHERE profile_row.id = p_actor_user_id AND profile_row.role = 'admin'
    )) THEN RETURN QUERY SELECT 'forbidden'::text, v_post.id, v_post.revision; RETURN; END IF;
    v_new_post_id := v_post.id;
    SELECT array_agg(DISTINCT ref_row.image_id ORDER BY ref_row.image_id) INTO v_old_image_ids
    FROM public.board_post_image_refs AS ref_row WHERE ref_row.post_id = v_new_post_id;
  ELSE
    INSERT INTO public.posts AS post_row (
      title, content, category, image_url, is_notice, author, user_id, password_hash, ip_address,
      discord_url, discord_channel_id, clan_info
    ) VALUES (
      p_title, p_content, p_category, p_image_url, COALESCE(p_is_notice, false), p_author, p_user_id,
      p_password_hash, p_ip_address, p_discord_url, p_discord_channel_id, p_clan_info
    ) RETURNING post_row.id, post_row.revision INTO v_new_post_id, v_post.revision;
    v_old_image_ids := ARRAY[]::uuid[];
  END IF;

  v_requested_image_ids := array_cat(COALESCE(v_old_image_ids, ARRAY[]::uuid[]),
    array_cat(COALESCE(p_content_image_ids, ARRAY[]::uuid[]),
      CASE WHEN p_thumbnail_image_id IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[p_thumbnail_image_id] END));

  -- write와 claim은 모두 image id 오름차순으로 잠가 detach/attach와 worker 간 lock 순서를 고정한다.
  PERFORM 1
  FROM (
    WITH requested_image_ids AS (
      SELECT DISTINCT requested_item.requested_image_id
      FROM unnest(v_requested_image_ids) AS requested_item(requested_image_id)
    ), locked_image_ids AS (
      SELECT image_row.id
      FROM public.board_image_objects AS image_row
      JOIN requested_image_ids AS requested_row ON requested_row.requested_image_id = image_row.id
      ORDER BY requested_row.requested_image_id
      FOR UPDATE
    ) SELECT locked_image_ids.id FROM locked_image_ids
  ) AS locked_rows;

  FOREACH v_image_id IN ARRAY COALESCE(p_content_image_ids, ARRAY[]::uuid[]) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.board_image_objects AS image_row
      WHERE image_row.id = v_image_id AND image_row.status = 'ready'
        AND (image_row.owner_user_id = p_actor_user_id OR EXISTS (
          SELECT 1 FROM public.board_post_image_refs AS ref_row
          WHERE ref_row.post_id = v_new_post_id AND ref_row.image_id = image_row.id
        ))
    ) THEN RAISE EXCEPTION 'invalid_board_image_reference'; END IF;
  END LOOP;
  IF p_thumbnail_image_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.board_image_objects AS image_row
    WHERE image_row.id = p_thumbnail_image_id AND image_row.status = 'ready'
      AND (image_row.owner_user_id = p_actor_user_id OR EXISTS (
        SELECT 1 FROM public.board_post_image_refs AS ref_row
        WHERE ref_row.post_id = v_new_post_id AND ref_row.image_id = image_row.id
      ))
  ) THEN RAISE EXCEPTION 'invalid_board_image_reference'; END IF;

  DELETE FROM public.board_post_image_refs AS ref_row WHERE ref_row.post_id = v_new_post_id;
  FOREACH v_image_id IN ARRAY COALESCE(p_content_image_ids, ARRAY[]::uuid[]) LOOP
    INSERT INTO public.board_post_image_refs (post_id, image_id, usage)
    VALUES (v_new_post_id, v_image_id, 'content') ON CONFLICT DO NOTHING;
  END LOOP;
  IF p_thumbnail_image_id IS NOT NULL THEN
    INSERT INTO public.board_post_image_refs (post_id, image_id, usage)
    VALUES (v_new_post_id, p_thumbnail_image_id, 'thumbnail') ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.board_image_objects AS image_row
  SET status = 'delete_pending', delete_after = now(), delete_lease_until = NULL,
      delete_lease_token = NULL, updated_at = now()
  WHERE image_row.id = ANY(COALESCE(v_old_image_ids, ARRAY[]::uuid[]))
    AND image_row.status = 'ready'
    AND NOT EXISTS (
      SELECT 1 FROM public.board_post_image_refs AS ref_row WHERE ref_row.image_id = image_row.id
    );

  IF p_post_id IS NOT NULL THEN
    UPDATE public.posts AS post_row
    SET title = p_title, content = p_content, category = p_category, image_url = p_image_url,
        is_notice = COALESCE(p_is_notice, false), discord_url = p_discord_url,
        discord_channel_id = p_discord_channel_id, clan_info = p_clan_info,
        revision = post_row.revision + 1
    WHERE post_row.id = v_new_post_id
    RETURNING post_row.revision INTO v_post.revision;
  END IF;
  RETURN QUERY SELECT 'ok'::text, v_new_post_id, v_post.revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_board_image_deletions(
  p_limit integer, p_now timestamptz, p_lease_seconds integer
)
RETURNS TABLE(image_id uuid, bucket_id text, storage_key text, lease_token uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_lease_seconds <> 300 THEN
    RAISE EXCEPTION 'invalid_board_image_deletion_claim';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT object_row.id
    FROM public.board_image_objects AS object_row
    WHERE ((object_row.status = 'delete_pending' AND object_row.delete_after <= p_now)
      OR (object_row.status = 'deleting' AND object_row.delete_lease_until <= p_now)
      OR (object_row.status = 'pending' AND object_row.expires_at <= p_now))
      AND NOT EXISTS (
        SELECT 1 FROM public.board_post_image_refs AS ref_row
        WHERE ref_row.image_id = object_row.id
      )
    ORDER BY object_row.id
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(p_limit, 20)
  ), claimed AS (
    UPDATE public.board_image_objects AS object_row
    SET status = 'deleting', delete_lease_token = gen_random_uuid(),
        delete_lease_until = p_now + interval '5 minutes', delete_attempts = object_row.delete_attempts + 1,
        updated_at = p_now
    FROM candidates AS candidate_row
    WHERE object_row.id = candidate_row.id
      AND NOT EXISTS (
        SELECT 1 FROM public.board_post_image_refs AS ref_row
        WHERE ref_row.image_id = object_row.id
      )
    RETURNING object_row.id, object_row.bucket_id, object_row.storage_key, object_row.delete_lease_token
  ) SELECT claimed.id, claimed.bucket_id, claimed.storage_key, claimed.delete_lease_token FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_board_image_deletions_for_owner(
  p_owner_user_id uuid, p_image_ids uuid[], p_now timestamptz, p_lease_seconds integer
)
RETURNS TABLE(image_id uuid, bucket_id text, storage_key text, lease_token uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF p_owner_user_id IS NULL OR p_image_ids IS NULL OR p_now IS NULL
    OR cardinality(p_image_ids) < 1 OR cardinality(p_image_ids) > 20
    OR array_position(p_image_ids, NULL) IS NOT NULL
    OR p_lease_seconds IS NULL OR p_lease_seconds <> 300 THEN
    RAISE EXCEPTION 'invalid_owner_board_image_deletion_claim';
  END IF;

  RETURN QUERY
  WITH requested_ids AS (
    SELECT DISTINCT requested_item.requested_id
    FROM unnest(p_image_ids) AS requested_item(requested_id)
  ), candidates AS (
    SELECT object_row.id
    FROM public.board_image_objects AS object_row
    JOIN requested_ids AS requested_row ON requested_row.requested_id = object_row.id
    WHERE object_row.owner_user_id = p_owner_user_id
      AND (object_row.status IN ('pending', 'ready', 'delete_pending')
        OR (object_row.status = 'deleting' AND object_row.delete_lease_until <= p_now))
      AND NOT EXISTS (
        SELECT 1 FROM public.board_post_image_refs AS ref_row
        WHERE ref_row.image_id = object_row.id
      )
    ORDER BY object_row.id
    FOR UPDATE SKIP LOCKED
    LIMIT 20
  ), claimed AS (
    UPDATE public.board_image_objects AS object_row
    SET status = 'deleting', delete_lease_token = gen_random_uuid(),
        delete_lease_until = p_now + interval '5 minutes',
        delete_attempts = object_row.delete_attempts + 1, updated_at = p_now
    FROM candidates AS candidate_row
    WHERE object_row.id = candidate_row.id
      AND object_row.owner_user_id = p_owner_user_id
      AND (object_row.status IN ('pending', 'ready', 'delete_pending')
        OR (object_row.status = 'deleting' AND object_row.delete_lease_until <= p_now))
      AND NOT EXISTS (
        SELECT 1 FROM public.board_post_image_refs AS ref_row
        WHERE ref_row.image_id = object_row.id
      )
    RETURNING object_row.id, object_row.bucket_id, object_row.storage_key, object_row.delete_lease_token
  )
  SELECT claimed.id, claimed.bucket_id, claimed.storage_key, claimed.delete_lease_token
  FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_board_image_deletion(
  p_image_id uuid, p_lease_token uuid, p_deleted boolean
)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  UPDATE public.board_image_objects AS object_row
  SET status = CASE WHEN p_deleted THEN 'deleted' ELSE 'delete_pending' END,
      delete_after = CASE WHEN p_deleted THEN object_row.delete_after ELSE now() + interval '1 day' END,
      delete_lease_until = NULL, delete_lease_token = NULL, updated_at = now()
  WHERE object_row.id = p_image_id AND object_row.status = 'deleting'
    AND object_row.delete_lease_token = p_lease_token;
  RETURN FOUND;
END;
$$;

DO $$
BEGIN
  INSERT INTO public.board_image_objects (bucket_id, storage_key, status)
  SELECT storage_object.bucket_id, storage_object.name, 'legacy_retained'
  FROM storage.objects AS storage_object
  WHERE storage_object.bucket_id = 'images'
  ON CONFLICT (bucket_id, storage_key) DO NOTHING;

  INSERT INTO public.board_post_image_refs (post_id, image_id, usage)
  WITH legacy_urls AS (
    SELECT post_row.id AS post_id, post_row.image_url AS image_url, 'thumbnail'::text AS usage
    FROM public.posts AS post_row WHERE post_row.image_url IS NOT NULL
    UNION ALL
    SELECT post_row.id, image_match.matches[1], 'content'::text
    FROM public.posts AS post_row
    CROSS JOIN LATERAL regexp_matches(COALESCE(post_row.content, ''), '<img[^>]+src=["'']([^"'' >]+)', 'g') AS image_match(matches)
  )
  SELECT legacy_url.post_id, image_row.id, legacy_url.usage
  FROM legacy_urls AS legacy_url
  JOIN storage.objects AS storage_object ON storage_object.bucket_id = 'images'
  JOIN public.board_image_objects AS image_row
    ON image_row.bucket_id = storage_object.bucket_id AND image_row.storage_key = storage_object.name
  WHERE legacy_url.image_url LIKE 'https://%.supabase.co/storage/v1/object/public/images/%'
    AND position('%' in legacy_url.image_url) = 0
    AND regexp_replace(legacy_url.image_url,
      '^https://[a-z0-9-]+[.]supabase[.]co/storage/v1/object/public/images/', '') = storage_object.name
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_board_image_upload(uuid, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_board_image_upload(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_board_post_with_images(bigint, uuid, bigint, text, text, text, text, boolean, text, uuid, text, text, text, text, jsonb, uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_board_image_deletions(integer, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_board_image_deletions_for_owner(uuid, uuid[], timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_board_image_deletion(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_board_image_upload(uuid, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_board_image_upload(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.write_board_post_with_images(bigint, uuid, bigint, text, text, text, text, boolean, text, uuid, text, text, text, text, jsonb, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_board_image_deletions(integer, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_board_image_deletions_for_owner(uuid, uuid[], timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_board_image_deletion(uuid, uuid, boolean) TO service_role;
