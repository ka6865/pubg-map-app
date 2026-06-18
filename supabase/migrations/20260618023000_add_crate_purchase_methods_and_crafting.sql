-- 1. crate_templates 테이블 컬럼 추가
ALTER TABLE public.crate_templates
ADD COLUMN price_bp INTEGER DEFAULT NULL,
ADD COLUMN price_bp_limit INTEGER DEFAULT 50,
ADD COLUMN ticket_currency_code TEXT DEFAULT NULL,
ADD COLUMN ticket_price_single INTEGER DEFAULT NULL,
ADD COLUMN ticket_price_bundle INTEGER DEFAULT NULL,
ADD COLUMN bonus_currency_code TEXT DEFAULT NULL,
ADD COLUMN bonus_amount_single INTEGER DEFAULT NULL,
ADD COLUMN bonus_amount_bundle INTEGER DEFAULT NULL;

-- 2. 2026 블랙 마켓 화물 상자 백필 (e2b7a9f8-c2b4-4b53-bc2a-59dfc1214005)
UPDATE public.crate_templates
SET 
  price_bp = 10000,
  price_bp_limit = 50,
  ticket_currency_code = 'blackmarket_ticket',
  ticket_price_single = 1,
  ticket_price_bundle = 10,
  bonus_currency_code = 'blackmarket_token',
  bonus_amount_single = 10,
  bonus_amount_bundle = 100
WHERE id = 'e2b7a9f8-c2b4-4b53-bc2a-59dfc1214005';

-- 3. 밀수품 상자들 백필 (type = 'contraband')
UPDATE public.crate_templates
SET 
  price_bp = 8000,
  price_bp_limit = 50,
  ticket_currency_code = 'contraband_coupon',
  ticket_price_single = 10,
  ticket_price_bundle = 100,
  bonus_currency_code = 'contraband_scrap',
  bonus_amount_single = 1,
  bonus_amount_bundle = 10
WHERE type = 'contraband';

-- 4. craftable_items 테이블 신설
CREATE TABLE public.craftable_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_key TEXT NOT NULL,
    display_name TEXT NOT NULL,
    token_cost INTEGER NOT NULL,
    asset_id UUID REFERENCES public.crate_item_assets(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. craftable_items RLS 보안 활성화
ALTER TABLE public.craftable_items ENABLE ROW LEVEL SECURITY;

-- 누구나 조회 가능 정책
CREATE POLICY "Allow public read access to craftable_items"
ON public.craftable_items
FOR SELECT
TO public
USING (true);

-- 관리자만 수정 가능 정책
CREATE POLICY "Allow admin to manage craftable_items"
ON public.craftable_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- 6. 2026 블랙 마켓 특수 제작소 아이템 12종 마스터 데이터 적재
INSERT INTO public.craftable_items (season_key, display_name, token_cost, asset_id, category) VALUES
('2026_blackmarket', '악마의 손길 - ACE32 (퍼플 푸시아)', 4500, '6b39228f-48f0-465a-8ecd-d8608254bcbc', '크로마'),
('2026_blackmarket', '레스트 인 핑크 - 드라구노프 (핑크 옐로우)', 4500, '891e6c15-f972-4146-9751-da4f918cdc68', '크로마'),
('2026_blackmarket', '징글 벨 - 미니14 (골드 블루)', 4500, '6495362b-ffd1-4d01-bf25-e757fe7b38b9', '크로마'),
('2026_blackmarket', '네온 드림 - AUG (화이트 오렌지)', 4500, '18f0deed-ad1a-428a-aef1-7ffeff291b18', '크로마'),
('2026_blackmarket', '악마의 손길 - ACE32', 2000, '59e1a67b-149b-45f0-9768-825211c16dde', '무기'),
('2026_blackmarket', '레스트 인 핑크 - 드라구노프', 2000, '743b8fa0-5ec1-4e76-b2a4-b136109aea46', '무기'),
('2026_blackmarket', '징글 벨 - 미니14', 2000, '200dac2f-e1ab-42ce-b313-e8940c635529', '무기'),
('2026_blackmarket', '네온 드림 - AUG', 2000, '45b85c58-bb88-46f9-80bc-ef7bbdd56c39', '무기'),
('2026_blackmarket', '악마의 손길 - ACE32 (네임플레이트)', 400, '92c9729e-bd4c-4bad-9872-fcda918b521a', '네임플레이트'),
('2026_blackmarket', '레스트 인 핑크 - 드라구노프 (네임플레이트)', 400, 'a60f62b7-231b-40ae-b53a-a8691baa1da4', '네임플레이트'),
('2026_blackmarket', '징글 벨 - 미니14 (네임플레이트)', 400, '671ac731-a78e-4a94-870a-f06df5f33c7c', '네임플레이트'),
('2026_blackmarket', '네온 드림 - AUG (네임플레이트)', 400, '59d16dd2-9114-480c-81c5-1a1515d531cb', '네임플레이트');
