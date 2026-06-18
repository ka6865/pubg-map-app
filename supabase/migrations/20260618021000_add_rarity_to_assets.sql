-- 1. crate_item_assets 테이블에 rarity 컬럼 추가
ALTER TABLE crate_item_assets ADD COLUMN IF NOT EXISTS rarity TEXT;

-- 2. 기존 데이터의 rarity 값을 마스터 자산 테이블로 백필(Backfill)
UPDATE crate_item_assets assets
SET rarity = COALESCE(
    (SELECT rarity FROM crate_items items WHERE items.asset_id = assets.id LIMIT 1),
    (SELECT rarity FROM prime_parcel_items prime WHERE prime.asset_id = assets.id LIMIT 1),
    'COMMON'
);

-- 3. 혹시 null 상태로 남아있는 자산들에 대해 기본값 지정
UPDATE crate_item_assets
SET rarity = 'COMMON'
WHERE rarity IS NULL;
