-- 1. system_settings 테이블 생성
create table if not exists public.system_settings (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. RLS 활성화
alter table public.system_settings enable row level security;

-- 3. 읽기 정책 (비회원 포함 전원 허용)
create policy "Allow public read system_settings"
  on public.system_settings for select
  using (true);

-- 4. 쓰기 정책 (RLS 수준 차단 - API Route에서 Service Role Key를 사용한 supabaseAdmin으로만 조작)
create policy "Allow service_role write system_settings"
  on public.system_settings for all
  using (false)
  with check (false);

-- 5. 기본값 시드 데이터 주입
insert into public.system_settings (key, value, description) values
('notice_active_id', '', '강제 고정 노출할 공지글 ID (비어있을 시 최신 공지 자동 노출)'),
('notice_display_days', '7', '공지 배너 노출 기간 (일 단위 정수, 0이면 기한 없음)')
on conflict (key) do nothing;
