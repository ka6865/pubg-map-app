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

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.board_image_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_post_image_refs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.board_image_objects, public.board_post_image_refs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.board_image_objects, public.board_post_image_refs TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('board-images-v2', 'board-images-v2', true, 1572864, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Authenticated Users Insert" ON storage.objects;
DROP POLICY IF EXISTS "Delete Policy" ON storage.objects;

CREATE OR REPLACE FUNCTION public.reserve_board_image_upload(
  p_owner_user_id uuid,
  p_expected_mime_type text,
  p_max_bytes bigint
)
RETURNS TABLE(image_id uuid, bucket_id text, storage_key text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_image_id uuid := gen_random_uuid();
BEGIN
  IF p_owner_user_id IS NULL
    OR p_expected_mime_type NOT IN ('image/png', 'image/jpeg', 'image/webp')
    OR p_max_bytes IS NULL OR p_max_bytes <= 0 OR p_max_bytes > 1572864 THEN
    RAISE EXCEPTION 'invalid_board_image_reservation';
  END IF;

  INSERT INTO public.board_image_objects (
    id, bucket_id, storage_key, owner_user_id, status, expected_mime_type, max_bytes, expires_at
  ) VALUES (
    v_image_id, 'board-images-v2', v_image_id::text, p_owner_user_id, 'pending',
    p_expected_mime_type, p_max_bytes, now() + interval '1 hour'
  );

  RETURN QUERY SELECT v_image_id, 'board-images-v2'::text, v_image_id::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_board_image_upload(
  p_image_id uuid,
  p_owner_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_image public.board_image_objects%ROWTYPE;
  v_mime_type text;
  v_size bigint;
BEGIN
  SELECT * INTO v_image
  FROM public.board_image_objects
  WHERE id = p_image_id AND owner_user_id = p_owner_user_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;

  SELECT metadata ->> 'mimetype', (metadata ->> 'size')::bigint
  INTO v_mime_type, v_size
  FROM storage.objects
  WHERE bucket_id = v_image.bucket_id AND name = v_image.storage_key;

  IF NOT FOUND OR v_mime_type IS DISTINCT FROM v_image.expected_mime_type
    OR v_size IS NULL OR v_size > v_image.max_bytes THEN
    RETURN false;
  END IF;

  UPDATE public.board_image_objects
  SET status = 'ready', expires_at = NULL, updated_at = now()
  WHERE id = v_image.id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.write_board_post_with_images(
  p_post_id bigint,
  p_actor_user_id uuid,
  p_expected_revision bigint,
  p_title text,
  p_content text,
  p_category text,
  p_image_url text,
  p_is_notice boolean,
  p_author text,
  p_user_id uuid,
  p_password_hash text,
  p_ip_address text,
  p_discord_url text,
  p_discord_channel_id text,
  p_clan_info jsonb,
  p_content_image_ids uuid[],
  p_thumbnail_image_id uuid
)
RETURNS TABLE(result_code text, post_id bigint, revision bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_post public.posts%ROWTYPE;
  v_image_id uuid;
  v_new_post_id bigint;
  v_old_image_ids uuid[];
BEGIN
  IF p_post_id IS NOT NULL THEN
    SELECT * INTO v_post FROM public.posts WHERE id = p_post_id FOR UPDATE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text, NULL::bigint, NULL::bigint; RETURN; END IF;
    IF v_post.revision <> p_expected_revision THEN
      RETURN QUERY SELECT 'revision_conflict'::text, v_post.id, v_post.revision; RETURN;
    END IF;
    IF p_actor_user_id IS NULL OR (v_post.user_id IS DISTINCT FROM p_actor_user_id AND NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = p_actor_user_id AND role = 'admin'
    )) THEN
      RETURN QUERY SELECT 'forbidden'::text, v_post.id, v_post.revision; RETURN;
    END IF;
    v_new_post_id := v_post.id;
  ELSE
    INSERT INTO public.posts (
      title, content, category, image_url, is_notice, author, user_id, password_hash, ip_address,
      discord_url, discord_channel_id, clan_info
    ) VALUES (
      p_title, p_content, p_category, p_image_url, COALESCE(p_is_notice, false), p_author, p_user_id,
      p_password_hash, p_ip_address, p_discord_url, p_discord_channel_id, p_clan_info
    ) RETURNING id INTO v_new_post_id;
  END IF;

  FOREACH v_image_id IN ARRAY COALESCE(p_content_image_ids, ARRAY[]::uuid[]) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.board_image_objects image
      WHERE image.id = v_image_id AND image.status = 'ready'
        AND (image.owner_user_id = p_actor_user_id OR EXISTS (
          SELECT 1 FROM public.board_post_image_refs ref
          WHERE ref.post_id = v_new_post_id AND ref.image_id = image.id
        ))
    ) THEN RAISE EXCEPTION 'invalid_board_image_reference'; END IF;
  END LOOP;
  IF p_thumbnail_image_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.board_image_objects image
    WHERE image.id = p_thumbnail_image_id AND image.status = 'ready'
      AND (image.owner_user_id = p_actor_user_id OR EXISTS (
        SELECT 1 FROM public.board_post_image_refs ref
        WHERE ref.post_id = v_new_post_id AND ref.image_id = image.id
      ))
  ) THEN RAISE EXCEPTION 'invalid_board_image_reference'; END IF;

  SELECT array_agg(DISTINCT image_id) INTO v_old_image_ids
  FROM public.board_post_image_refs WHERE post_id = v_new_post_id;
  DELETE FROM public.board_post_image_refs WHERE post_id = v_new_post_id;

  FOREACH v_image_id IN ARRAY COALESCE(p_content_image_ids, ARRAY[]::uuid[]) LOOP
    INSERT INTO public.board_post_image_refs (post_id, image_id, usage)
    VALUES (v_new_post_id, v_image_id, 'content') ON CONFLICT DO NOTHING;
  END LOOP;
  IF p_thumbnail_image_id IS NOT NULL THEN
    INSERT INTO public.board_post_image_refs (post_id, image_id, usage)
    VALUES (v_new_post_id, p_thumbnail_image_id, 'thumbnail') ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.board_image_objects image
  SET status = 'delete_pending', delete_after = now(), delete_lease_until = NULL,
      delete_lease_token = NULL, updated_at = now()
  WHERE image.id = ANY(COALESCE(v_old_image_ids, ARRAY[]::uuid[]))
    AND image.status = 'ready'
    AND NOT EXISTS (SELECT 1 FROM public.board_post_image_refs ref WHERE ref.image_id = image.id);

  IF p_post_id IS NOT NULL THEN
    UPDATE public.posts
    SET title = p_title, content = p_content, category = p_category, image_url = p_image_url,
        is_notice = COALESCE(p_is_notice, false), discord_url = p_discord_url,
        discord_channel_id = p_discord_channel_id, clan_info = p_clan_info,
        revision = revision + 1
    WHERE id = v_new_post_id
    RETURNING revision INTO v_post.revision;
  ELSE
    SELECT revision INTO v_post.revision FROM public.posts WHERE id = v_new_post_id;
  END IF;

  RETURN QUERY SELECT 'ok'::text, v_new_post_id, v_post.revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_board_image_deletions(
  p_limit integer,
  p_now timestamptz,
  p_lease_seconds integer
)
RETURNS TABLE(image_id uuid, bucket_id text, storage_key text, lease_token uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_lease_seconds <> 300 THEN
    RAISE EXCEPTION 'invalid_board_image_deletion_claim';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT id FROM public.board_image_objects
    WHERE status = 'delete_pending' AND delete_after <= p_now
      AND (delete_lease_until IS NULL OR delete_lease_until <= p_now)
    ORDER BY delete_after, id
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(p_limit, 20)
  ), claimed AS (
    UPDATE public.board_image_objects image
    SET status = 'deleting', delete_lease_token = gen_random_uuid(),
        delete_lease_until = p_now + interval '5 minutes', delete_attempts = delete_attempts + 1,
        updated_at = p_now
    FROM candidates WHERE image.id = candidates.id
    RETURNING image.id, image.bucket_id, image.storage_key, image.delete_lease_token
  ) SELECT claimed.id, claimed.bucket_id, claimed.storage_key, claimed.delete_lease_token FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_board_image_deletion(
  p_image_id uuid,
  p_lease_token uuid,
  p_deleted boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.board_image_objects
  SET status = CASE WHEN p_deleted THEN 'deleted' ELSE 'delete_pending' END,
      delete_after = CASE WHEN p_deleted THEN delete_after ELSE now() + interval '1 day' END,
      delete_lease_until = NULL, delete_lease_token = NULL, updated_at = now()
  WHERE id = p_image_id AND status = 'deleting' AND delete_lease_token = p_lease_token;
  RETURN FOUND;
END;
$$;

DO $$
BEGIN
  INSERT INTO public.board_image_objects (bucket_id, storage_key, status)
  SELECT 'images', regexp_replace(p.image_url, '^.*/images/', ''), 'legacy_retained'
  FROM public.posts p
  WHERE p.image_url IS NOT NULL AND btrim(p.image_url) <> ''
  ON CONFLICT (bucket_id, storage_key) DO NOTHING;

  INSERT INTO public.board_post_image_refs (post_id, image_id, usage)
  SELECT p.id, image.id, 'thumbnail'
  FROM public.posts p
  JOIN public.board_image_objects image
    ON image.bucket_id = 'images'
   AND image.storage_key = regexp_replace(p.image_url, '^.*/images/', '')
  WHERE p.image_url IS NOT NULL AND btrim(p.image_url) <> ''
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_board_image_upload(uuid, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_board_image_upload(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.write_board_post_with_images(bigint, uuid, bigint, text, text, text, text, boolean, text, uuid, text, text, text, text, jsonb, uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_board_image_deletions(integer, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_board_image_deletion(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_board_image_upload(uuid, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_board_image_upload(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.write_board_post_with_images(bigint, uuid, bigint, text, text, text, text, boolean, text, uuid, text, text, text, text, jsonb, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_board_image_deletions(integer, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_board_image_deletion(uuid, uuid, boolean) TO service_role;
