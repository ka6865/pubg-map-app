-- 1. 게시글 상태를 나타내는 ENUM 타입 생성 (중복 방지 처리)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'post_status') THEN
    CREATE TYPE post_status AS ENUM ('draft', 'published');
  END IF;
END $$;

-- 2. posts 테이블 컬럼 보강
ALTER TABLE posts ADD COLUMN IF NOT EXISTS status post_status DEFAULT 'published';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS parent_id integer REFERENCES posts(id) ON DELETE CASCADE;

-- 3. 기존 데이터들을 published 상태로 마이그레이션
UPDATE posts SET status = 'published' WHERE status IS NULL OR status = 'draft';

-- 4. posts 테이블 RLS(Row Level Security) 설정 변경
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- 4.1. 기존 정책 삭제
DROP POLICY IF EXISTS "Anyone can read posts" ON posts;
DROP POLICY IF EXISTS "누구나 게시글 조회 가능" ON posts;
DROP POLICY IF EXISTS "본인 글만 수정 가능" ON posts;
DROP POLICY IF EXISTS "본인 글만 삭제 가능" ON posts;

-- 4.2. 신규 SELECT 정책 1: 발행완료(published) 게시글은 누구나 조회 가능
CREATE POLICY "Allow public read published posts" ON posts
FOR SELECT USING (status = 'published');

-- 4.3. 신규 SELECT 정책 2: 초안(draft) 상태 글은 작성자 본인 또는 어드민만 조회 가능
CREATE POLICY "Allow owners and admins to select posts" ON posts
FOR SELECT USING (
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- 4.4. 신규 UPDATE 정책: 작성자 본인 또는 어드민만 수정 가능
CREATE POLICY "Allow owners and admins to update posts" ON posts
FOR UPDATE USING (
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- 4.5. 신규 DELETE 정책: 작성자 본인 또는 어드민만 삭제 가능
CREATE POLICY "Allow owners and admins to delete posts" ON posts
FOR DELETE USING (
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- 5. 중복 제목 방지 제약조건을 조건부 유니크 인덱스로 전환
-- (초안 draft 글 생성 시 원본 제목과의 uniqueConstraint 위반 방지)
ALTER TABLE posts DROP CONSTRAINT IF EXISTS unique_post_title;
CREATE UNIQUE INDEX IF NOT EXISTS unique_post_published_title ON posts (title) WHERE (status = 'published');
