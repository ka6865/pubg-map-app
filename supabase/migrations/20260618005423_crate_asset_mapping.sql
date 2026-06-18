CREATE TABLE IF NOT EXISTS crate_item_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_key TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    r2_key TEXT,
    image_url TEXT,
    aliases TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE crate_item_assets ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE crate_item_assets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE crate_item_assets TO service_role;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'crate_item_assets'
          AND policyname = 'Allow public read access on crate_item_assets'
    ) THEN
        CREATE POLICY "Allow public read access on crate_item_assets"
        ON crate_item_assets FOR SELECT
        USING (true);
    END IF;
END $$;

ALTER TABLE crate_templates ADD COLUMN IF NOT EXISTS asset_key TEXT;
ALTER TABLE crate_templates ADD COLUMN IF NOT EXISTS normalized_name TEXT;
ALTER TABLE crate_templates ADD COLUMN IF NOT EXISTS r2_key TEXT;
ALTER TABLE crate_templates ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES crate_item_assets(id) ON DELETE SET NULL;

ALTER TABLE crate_items ADD COLUMN IF NOT EXISTS asset_key TEXT;
ALTER TABLE crate_items ADD COLUMN IF NOT EXISTS normalized_name TEXT;
ALTER TABLE crate_items ADD COLUMN IF NOT EXISTS r2_key TEXT;
ALTER TABLE crate_items ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES crate_item_assets(id) ON DELETE SET NULL;

ALTER TABLE prime_parcel_items ADD COLUMN IF NOT EXISTS asset_key TEXT;
ALTER TABLE prime_parcel_items ADD COLUMN IF NOT EXISTS normalized_name TEXT;
ALTER TABLE prime_parcel_items ADD COLUMN IF NOT EXISTS r2_key TEXT;
ALTER TABLE prime_parcel_items ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES crate_item_assets(id) ON DELETE SET NULL;

ALTER TABLE bonus_items ADD COLUMN IF NOT EXISTS asset_key TEXT;
ALTER TABLE bonus_items ADD COLUMN IF NOT EXISTS normalized_name TEXT;
ALTER TABLE bonus_items ADD COLUMN IF NOT EXISTS r2_key TEXT;
ALTER TABLE bonus_items ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES crate_item_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crate_item_assets_normalized_name_idx ON crate_item_assets(normalized_name);
CREATE INDEX IF NOT EXISTS crate_templates_asset_key_idx ON crate_templates(asset_key);
CREATE INDEX IF NOT EXISTS crate_items_asset_key_idx ON crate_items(asset_key);
CREATE INDEX IF NOT EXISTS prime_parcel_items_asset_key_idx ON prime_parcel_items(asset_key);
CREATE INDEX IF NOT EXISTS bonus_items_asset_key_idx ON bonus_items(asset_key);

CREATE OR REPLACE FUNCTION public.normalize_crate_asset_name(input_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT trim(both '_' from regexp_replace(lower(coalesce(input_name, '')), '[^[:alnum:]]+', '_', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.crate_asset_key_from_image(input_url TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT nullif(
        regexp_replace(
            regexp_replace(
                split_part(coalesce(input_url, ''), '?', 1),
                '^.*/',
                ''
            ),
            '\.[^.]*$',
            ''
        ),
        ''
    )
$$;

UPDATE crate_templates
SET
    r2_key = CASE
        WHEN coalesce(image_url, '') LIKE '/api/images/crates/%'
            THEN 'crates/' || regexp_replace(image_url, '^/api/images/crates/', '')
        ELSE r2_key
    END,
    normalized_name = coalesce(nullif(normalized_name, ''), public.normalize_crate_asset_name(name)),
    asset_key = coalesce(nullif(asset_key, ''), public.crate_asset_key_from_image(image_url), public.normalize_crate_asset_name(name));

UPDATE crate_items
SET
    r2_key = CASE
        WHEN coalesce(image_url, '') LIKE '/api/images/crates/%'
            THEN 'crates/' || regexp_replace(image_url, '^/api/images/crates/', '')
        ELSE r2_key
    END,
    normalized_name = coalesce(nullif(normalized_name, ''), public.normalize_crate_asset_name(name)),
    asset_key = coalesce(nullif(asset_key, ''), public.crate_asset_key_from_image(image_url), public.normalize_crate_asset_name(name));

UPDATE prime_parcel_items
SET
    r2_key = CASE
        WHEN coalesce(image_url, '') LIKE '/api/images/crates/%'
            THEN 'crates/' || regexp_replace(image_url, '^/api/images/crates/', '')
        ELSE r2_key
    END,
    normalized_name = coalesce(nullif(normalized_name, ''), public.normalize_crate_asset_name(name)),
    asset_key = coalesce(nullif(asset_key, ''), public.crate_asset_key_from_image(image_url), public.normalize_crate_asset_name(name));

UPDATE bonus_items
SET
    r2_key = CASE
        WHEN coalesce(image_url, '') LIKE '/api/images/crates/%'
            THEN 'crates/' || regexp_replace(image_url, '^/api/images/crates/', '')
        ELSE r2_key
    END,
    normalized_name = coalesce(nullif(normalized_name, ''), public.normalize_crate_asset_name(name)),
    asset_key = coalesce(nullif(asset_key, ''), public.crate_asset_key_from_image(image_url), public.normalize_crate_asset_name(name));

INSERT INTO crate_item_assets (asset_key, display_name, normalized_name, r2_key, image_url, aliases)
SELECT asset_key, min(name), min(normalized_name), max(r2_key), max(image_url), array_agg(DISTINCT name)
FROM (
    SELECT asset_key, name, normalized_name, r2_key, image_url FROM crate_templates WHERE asset_key IS NOT NULL AND asset_key <> ''
    UNION ALL
    SELECT asset_key, name, normalized_name, r2_key, image_url FROM crate_items WHERE asset_key IS NOT NULL AND asset_key <> ''
    UNION ALL
    SELECT asset_key, name, normalized_name, r2_key, image_url FROM prime_parcel_items WHERE asset_key IS NOT NULL AND asset_key <> ''
    UNION ALL
    SELECT asset_key, name, normalized_name, r2_key, image_url FROM bonus_items WHERE asset_key IS NOT NULL AND asset_key <> ''
) assets
GROUP BY asset_key
ON CONFLICT (asset_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    normalized_name = EXCLUDED.normalized_name,
    r2_key = coalesce(EXCLUDED.r2_key, crate_item_assets.r2_key),
    image_url = coalesce(EXCLUDED.image_url, crate_item_assets.image_url),
    aliases = (
        SELECT array_agg(DISTINCT alias)
        FROM unnest(crate_item_assets.aliases || EXCLUDED.aliases) AS alias
    ),
    updated_at = timezone('utc'::text, now());

UPDATE crate_templates
SET asset_id = assets.id
FROM crate_item_assets assets
WHERE crate_templates.asset_key = assets.asset_key;

UPDATE crate_items
SET asset_id = assets.id
FROM crate_item_assets assets
WHERE crate_items.asset_key = assets.asset_key;

UPDATE prime_parcel_items
SET asset_id = assets.id
FROM crate_item_assets assets
WHERE prime_parcel_items.asset_key = assets.asset_key;

UPDATE bonus_items
SET asset_id = assets.id
FROM crate_item_assets assets
WHERE bonus_items.asset_key = assets.asset_key;
