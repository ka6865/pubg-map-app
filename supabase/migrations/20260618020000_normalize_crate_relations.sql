-- 1. crate_item_relations 매핑 테이블 신설
CREATE TABLE IF NOT EXISTS crate_item_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crate_template_id UUID NOT NULL REFERENCES crate_templates(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES crate_item_assets(id) ON DELETE CASCADE,
    drop_type TEXT NOT NULL CHECK (drop_type IN ('base', 'prime', 'bonus')),
    probability NUMERIC NOT NULL,
    token_count INTEGER NOT NULL DEFAULT 0,
    is_prime_parcel BOOLEAN NOT NULL DEFAULT false,
    is_extra_crate BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(crate_template_id, asset_id, drop_type)
);

-- 2. RLS 활성화
ALTER TABLE crate_item_relations ENABLE ROW LEVEL SECURITY;

-- 3. 권한 부여 및 SELECT Policy 생성
GRANT SELECT ON TABLE crate_item_relations TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE crate_item_relations TO service_role;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'crate_item_relations'
          AND policyname = 'Allow public read access on crate_item_relations'
    ) THEN
        CREATE POLICY "Allow public read access on crate_item_relations"
        ON crate_item_relations FOR SELECT
        USING (true);
    END IF;
END $$;

-- 4. 인덱스 생성 (조회 성능 최적화)
CREATE INDEX IF NOT EXISTS crate_item_relations_template_id_idx ON crate_item_relations(crate_template_id);
CREATE INDEX IF NOT EXISTS crate_item_relations_asset_id_idx ON crate_item_relations(asset_id);
CREATE INDEX IF NOT EXISTS crate_item_relations_drop_type_idx ON crate_item_relations(drop_type);

-- 5. 기존 데이터 마이그레이션 (GROUP BY로 중복 방지)
-- (1) crate_items 이관 (drop_type = 'base')
INSERT INTO crate_item_relations (crate_template_id, asset_id, drop_type, probability, token_count, is_prime_parcel, is_extra_crate)
SELECT crate_template_id, asset_id, 'base', MAX(probability), MAX(coalesce(token_count, 0)), bool_or(coalesce(is_prime_parcel, false)), false
FROM crate_items
WHERE asset_id IS NOT NULL
GROUP BY crate_template_id, asset_id
ON CONFLICT (crate_template_id, asset_id, drop_type) DO UPDATE SET
    probability = EXCLUDED.probability,
    token_count = EXCLUDED.token_count,
    is_prime_parcel = EXCLUDED.is_prime_parcel,
    updated_at = timezone('utc'::text, now());

-- (2) prime_parcel_items 이관 (drop_type = 'prime')
INSERT INTO crate_item_relations (crate_template_id, asset_id, drop_type, probability, token_count, is_prime_parcel, is_extra_crate)
SELECT crate_template_id, asset_id, 'prime', MAX(probability), 0, false, false
FROM prime_parcel_items
WHERE asset_id IS NOT NULL
GROUP BY crate_template_id, asset_id
ON CONFLICT (crate_template_id, asset_id, drop_type) DO UPDATE SET
    probability = EXCLUDED.probability,
    updated_at = timezone('utc'::text, now());

-- (3) bonus_items 이관 (drop_type = 'bonus')
INSERT INTO crate_item_relations (crate_template_id, asset_id, drop_type, probability, token_count, is_prime_parcel, is_extra_crate)
SELECT crate_template_id, asset_id, 'bonus', MAX(probability), MAX(coalesce(token_count, 0)), bool_or(coalesce(is_prime_parcel, false)), bool_or(coalesce(is_extra_crate, false))
FROM bonus_items
WHERE asset_id IS NOT NULL
GROUP BY crate_template_id, asset_id
ON CONFLICT (crate_template_id, asset_id, drop_type) DO UPDATE SET
    probability = EXCLUDED.probability,
    token_count = EXCLUDED.token_count,
    is_prime_parcel = EXCLUDED.is_prime_parcel,
    is_extra_crate = EXCLUDED.is_extra_crate,
    updated_at = timezone('utc'::text, now());
