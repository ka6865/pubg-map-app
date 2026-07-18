CREATE OR REPLACE FUNCTION public.create_published_post_comment(
  p_post_id bigint,
  p_user_id uuid,
  p_author text,
  p_content text,
  p_parent_id bigint,
  p_password_hash text,
  p_ip_address text
)
RETURNS TABLE (
  id bigint,
  post_id bigint,
  user_id uuid,
  author text,
  content text,
  parent_id bigint,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1
  FROM public.posts
  WHERE posts.id = p_post_id
    AND posts.status = 'published'
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_parent_id IS NOT NULL THEN
    PERFORM 1
    FROM public.comments
    WHERE comments.id = p_parent_id
      AND comments.post_id = p_post_id
    FOR SHARE;

    IF NOT FOUND THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  INSERT INTO public.comments (
    post_id,
    user_id,
    author,
    content,
    parent_id,
    password_hash,
    ip_address
  ) VALUES (
    p_post_id,
    p_user_id,
    p_author,
    p_content,
    p_parent_id,
    p_password_hash,
    p_ip_address
  )
  RETURNING
    comments.id,
    comments.post_id,
    comments.user_id,
    comments.author,
    comments.content,
    comments.parent_id,
    comments.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_published_post_comment(bigint, uuid, text, text, bigint, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_published_post_comment(bigint, uuid, text, text, bigint, text, text)
  TO service_role;

DROP POLICY IF EXISTS "본인 ID로만 글 작성 가능" ON public.posts;
DROP POLICY IF EXISTS "Allow owners and admins to update posts" ON public.posts;
DROP POLICY IF EXISTS "본인 ID로만 댓글 작성 가능" ON public.comments;
DROP POLICY IF EXISTS "본인 댓글만 수정 가능" ON public.comments;
DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;

REVOKE INSERT, UPDATE ON TABLE public.posts, public.comments
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON TABLE public.notifications
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.posts, public.comments
  TO service_role;
GRANT INSERT ON TABLE public.notifications TO service_role;
