-- [데이터 정합성 보완] profiles 테이블에 존재하지 않는 고립된 유저(Orphan) 데이터 정리
DELETE FROM public.notifications WHERE user_id NOT IN (SELECT id FROM public.profiles);
DELETE FROM public.post_likes WHERE user_id NOT IN (SELECT id FROM public.profiles);
UPDATE public.posts SET user_id = NULL WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM public.profiles);
UPDATE public.comments SET user_id = NULL WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM public.profiles);

-- 1. profiles 테이블의 id 외래키 제약조건 갱신 (auth.users 삭제 시 profiles 연쇄 삭제)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. posts 테이블의 user_id 외래키 제약조건 갱신 (profiles 삭제 시 posts.user_id를 NULL로 익명화)
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_user_id_fkey;
ALTER TABLE public.posts ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. comments 테이블의 user_id 외래키 제약조건 갱신 (profiles 삭제 시 comments.user_id를 NULL로 익명화)
ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;
ALTER TABLE public.comments ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 4. post_likes 테이블의 user_id 외래키 제약조건 갱신 (profiles 삭제 시 post_likes도 CASCADE 처리하여 좋아요 기록 정리)
ALTER TABLE public.post_likes DROP CONSTRAINT IF EXISTS post_likes_user_id_fkey;
ALTER TABLE public.post_likes ADD CONSTRAINT post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 5. notifications 테이블의 user_id 외래키 제약조건 갱신 (profiles 삭제 시 알림 정보 CASCADE 처리)
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
