-- Create bonus items table
CREATE TABLE IF NOT EXISTS bonus_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crate_template_id UUID NOT NULL REFERENCES crate_templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    probability NUMERIC(10, 6) NOT NULL, -- e.g. 0.065000 for 6.5%
    token_count INT NOT NULL DEFAULT 0,
    is_prime_parcel BOOLEAN NOT NULL DEFAULT false,
    is_extra_crate BOOLEAN NOT NULL DEFAULT false,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE bonus_items ENABLE ROW LEVEL SECURITY;

-- Select policies for public access (Read-only)
CREATE POLICY "Allow public read access on bonus_items" ON bonus_items FOR SELECT USING (true);

-- Seed bonus items for Harley-Davidson Loot Crate
INSERT INTO bonus_items (crate_template_id, name, probability, token_count, is_prime_parcel, is_extra_crate, image_url)
VALUES 
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf31', '할리데이비슨™ 최고급 꾸러미', 0.065000, 0, true, false, '/images/crates/harley_prime_parcel.png'),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf31', '할리데이비슨™ 토큰 x10', 0.100000, 10, false, false, '/images/crates/harley_token.png'),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf31', '[에픽 이상] 의상 및 장비 획득권', 0.005000, 0, false, false, '/images/crates/harley_gear.png'),
    ('d6b412a8-0a1b-43fe-a521-71fb342bcf31', '할리데이비슨™ 전리품 상자', 0.100000, 0, false, true, '/images/crates/harley_crate.png')
ON CONFLICT DO NOTHING;
