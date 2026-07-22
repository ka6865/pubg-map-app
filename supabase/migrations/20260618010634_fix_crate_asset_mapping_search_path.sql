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

GRANT SELECT ON TABLE public.crate_item_assets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crate_item_assets TO service_role;
