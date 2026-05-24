-- Create crate templates table
CREATE TABLE IF NOT EXISTS crate_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'loot_crate' or 'contraband'
    price_gcoin INT NOT NULL DEFAULT 200,
    bundle_price_gcoin INT NOT NULL DEFAULT 2000,
    image_url TEXT,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create crate items table (1st level drops)
CREATE TABLE IF NOT EXISTS crate_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crate_template_id UUID NOT NULL REFERENCES crate_templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rarity TEXT NOT NULL, -- 'ULTIMATE', 'LEGENDARY', 'EPIC', 'RARE'
    probability NUMERIC(10, 6) NOT NULL, -- e.g. 0.080000 for 8%
    image_url TEXT,
    is_prime_parcel BOOLEAN NOT NULL DEFAULT false,
    token_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create prime parcel items table (2nd level drops, inside prime parcel)
CREATE TABLE IF NOT EXISTS prime_parcel_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crate_template_id UUID NOT NULL REFERENCES crate_templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rarity TEXT NOT NULL,
    probability NUMERIC(10, 6) NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Enable
ALTER TABLE crate_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE crate_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE prime_parcel_items ENABLE ROW LEVEL SECURITY;

-- Select policies for public access (Read-only for all users)
CREATE POLICY "Allow public read access on crate_templates" ON crate_templates FOR SELECT USING (true);
CREATE POLICY "Allow public read access on crate_items" ON crate_items FOR SELECT USING (true);
CREATE POLICY "Allow public read access on prime_parcel_items" ON prime_parcel_items FOR SELECT USING (true);

-- Insert seed data
-- 1. Harley-Davidson Loot Crate
INSERT INTO crate_templates (id, name, type, price_gcoin, bundle_price_gcoin, image_url, description, active)
VALUES (
    'd6b412a8-0a1b-43fe-a521-71fb342bcf31',
    '할리데이비슨 전리품 상자',
    'loot_crate',
    200,
    2000,
    '/images/crates/harley_crate.png',
    '전설적인 모터사이클 할리데이비슨 CVO™ Road Glide® ST 콜라보 전리품 상자! 최고급 꾸러미 및 토큰을 획득하세요.',
    true
) ON CONFLICT (id) DO NOTHING;

-- Harley-Davidson Crate Items (1st Level Drops)
INSERT INTO crate_items (crate_template_id, name, rarity, probability, image_url, is_prime_parcel, token_count)
VALUES 
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf31', '할리데이비슨 최고급 꾸러미', 'ULTIMATE', 0.080000, '/images/crates/harley_prime_parcel.png', true, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf31', '할리데이비슨 이벤트 토큰 x15', 'LEGENDARY', 0.100000, '/images/crates/harley_token.png', false, 15),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf31', '할리데이비슨 이벤트 토큰 x10', 'LEGENDARY', 0.150000, '/images/crates/harley_token.png', false, 10),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf31', '할리데이비슨 이벤트 토큰 x5', 'EPIC', 0.200000, '/images/crates/harley_token.png', false, 5),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf31', '할리데이비슨 라이더 재킷 세트', 'LEGENDARY', 0.120000, '/images/crates/harley_jacket.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf31', '할리데이비슨 가죽 팬츠 & 부츠', 'EPIC', 0.150000, '/images/crates/harley_boots.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf31', '할리데이비슨 라이더 반장갑', 'RARE', 0.200000, '/images/crates/harley_gloves.png', false, 0)
ON CONFLICT DO NOTHING;

-- Harley-Davidson Prime Parcel Items (2nd Level Drops)
INSERT INTO prime_parcel_items (crate_template_id, name, rarity, probability, image_url)
VALUES 
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf31', '할리데이비슨 CVO™ Road Glide® ST (리미티드)', 'ULTIMATE', 0.020000, '/images/crates/harley_bike_limited.png'),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf31', '할리데이비슨 CVO™ Road Glide® ST (블랙)', 'ULTIMATE', 0.080000, '/images/crates/harley_bike_black.png'),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf31', '할리데이비슨 풀페이스 헬멧 & 기어', 'LEGENDARY', 0.250000, '/images/crates/harley_helmet.png'),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf31', '할리데이비슨 가죽 자켓 & 바이커 글래스', 'LEGENDARY', 0.350000, '/images/crates/harley_goggles.png'),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf31', '할리데이비슨 배너 & 엠블럼', 'EPIC', 0.300000, '/images/crates/harley_banner.png')
ON CONFLICT DO NOTHING;



-- 3. Ride or Die Contraband Crate
INSERT INTO crate_templates (id, name, type, price_gcoin, bundle_price_gcoin, image_url, description, active)
VALUES (
    'd6b412a8-0a1b-43fe-a521-71fb342bcf32',
    '라이드 오어 다이 - 밀수품 상자',
    'contraband',
    200,
    1800,
    '/images/crates/contraband_crate.png',
    '성장형 M249 스킨 [라이드 오어 다이] 및 크로마를 획득할 수 있는 밀수품 상자입니다.',
    true
) ON CONFLICT (id) DO NOTHING;

-- Ride or Die Items (1st Level Drops)
INSERT INTO crate_items (crate_template_id, name, rarity, probability, image_url, is_prime_parcel, token_count)
VALUES 
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf32', '라이드 오어 다이 - M249', 'ULTIMATE', 0.009000, '/images/crates/dragunov_gold.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf32', '라이드 오어 다이 - M249 (블랙 틸)', 'ULTIMATE', 0.009000, '/images/crates/dragunov_gold.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf32', '도면 (Schematic)', 'LEGENDARY', 0.009000, '/images/crates/schematic.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf32', '폴리머 (Polymer) x100', 'EPIC', 0.100000, '/images/crates/polymer.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf32', '러프 라이드 - S12K', 'LEGENDARY', 0.022000, '/images/crates/dragunov_silver.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf32', '다이너스티 - Kar98k', 'EPIC', 0.160000, '/images/crates/m416_desert.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf32', '러프 라이드 - 베릴 M762 & 토미 건', 'RARE', 0.300000, '/images/crates/parts_skin.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf32', '일반 클래식 스킨군', 'RARE', 0.391000, '/images/crates/classic_skins.png', false, 0)
ON CONFLICT DO NOTHING;

-- 4. Cosmic Caliber Contraband Crate
INSERT INTO crate_templates (id, name, type, price_gcoin, bundle_price_gcoin, image_url, description, active)
VALUES (
    'd6b412a8-0a1b-43fe-a521-71fb342bcf33',
    '코스믹 칼리버 - 밀수품 상자',
    'contraband',
    200,
    1800,
    '/images/crates/contraband_crate.png',
    '성장형 Kar98k 스킨 [코스믹 칼리버] 및 크로마를 획득할 수 있는 밀수품 상자입니다.',
    true
) ON CONFLICT (id) DO NOTHING;

-- Cosmic Caliber Items (1st Level Drops)
INSERT INTO crate_items (crate_template_id, name, rarity, probability, image_url, is_prime_parcel, token_count)
VALUES 
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf33', '코스믹 칼리버 - Kar98k', 'ULTIMATE', 0.009000, '/images/crates/dragunov_gold.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf33', '코스믹 칼리버 - Kar98k (화이트 옐로우)', 'ULTIMATE', 0.009000, '/images/crates/dragunov_gold.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf33', '도면 (Schematic)', 'LEGENDARY', 0.009000, '/images/crates/schematic.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf33', '폴리머 (Polymer) x100', 'EPIC', 0.100000, '/images/crates/polymer.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf33', '행성 경비대 - SCAR-L', 'LEGENDARY', 0.022000, '/images/crates/dragunov_silver.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf33', '스팀 게이지 - Kar98k', 'EPIC', 0.160000, '/images/crates/m416_desert.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf33', '행성 경비대 - M249 & 뮤턴트', 'RARE', 0.300000, '/images/crates/parts_skin.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf33', '일반 클래식 스킨군', 'RARE', 0.391000, '/images/crates/classic_skins.png', false, 0)
ON CONFLICT DO NOTHING;

-- 5. Gilded Circuit Contraband Crate
INSERT INTO crate_templates (id, name, type, price_gcoin, bundle_price_gcoin, image_url, description, active)
VALUES (
    'd6b412a8-0a1b-43fe-a521-71fb342bcf34',
    '골든 서킷 - 밀수품 상자',
    'contraband',
    200,
    1800,
    '/images/crates/contraband_crate.png',
    '특수 연막탄 스킨 [노란색 연막탄/분홍색 연막탄]을 획득할 수 있는 밀수품 상자입니다.',
    true
) ON CONFLICT (id) DO NOTHING;

-- Gilded Circuit Items (1st Level Drops)
INSERT INTO crate_items (crate_template_id, name, rarity, probability, image_url, is_prime_parcel, token_count)
VALUES 
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf34', '노란색 연막탄', 'ULTIMATE', 0.009000, '/images/crates/dragunov_gold.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf34', '분홍색 연막탄', 'ULTIMATE', 0.009000, '/images/crates/dragunov_gold.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf34', '도면 (Schematic)', 'LEGENDARY', 0.009000, '/images/crates/schematic.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf34', '폴리머 (Polymer) x100', 'EPIC', 0.100000, '/images/crates/polymer.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf34', '골드 리프 - M416', 'LEGENDARY', 0.022000, '/images/crates/dragunov_silver.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf34', '골든 서킷 - 미니14', 'EPIC', 0.160000, '/images/crates/m416_desert.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf34', '골든 서킷 - 마이크로 UZI', 'RARE', 0.300000, '/images/crates/parts_skin.png', false, 0),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf34', '일반 클래식 스킨군', 'RARE', 0.391000, '/images/crates/classic_skins.png', false, 0)
ON CONFLICT DO NOTHING;

