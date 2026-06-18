export type CrateRarity = "ULTIMATE" | "LEGENDARY" | "EPIC" | "RARE" | "SPECIAL" | "COMMON" | "ELITE";

export interface CrateItem {
  id: string;
  name: string;
  asset_key: string;
  normalized_name: string;
  r2_key: string;
  asset_id?: string | null;
  rarity: CrateRarity;
  probability: number;
  image_url: string;
  is_prime_parcel: boolean;
  token_count: number;
}

export interface PrimeParcelItem {
  id: string;
  name: string;
  asset_key: string;
  normalized_name: string;
  r2_key: string;
  asset_id?: string | null;
  rarity: CrateRarity;
  probability: number;
  image_url: string;
}

export interface BonusItem {
  id: string;
  name: string;
  asset_key: string;
  normalized_name: string;
  r2_key: string;
  asset_id?: string | null;
  probability: number;
  token_count: number;
  is_prime_parcel: boolean;
  is_extra_crate: boolean;
  image_url: string;
}

export interface CrateTemplate {
  id: string;
  name: string;
  asset_key: string;
  normalized_name: string;
  r2_key: string;
  asset_id?: string | null;
  type: "loot_crate" | "contraband";
  price_gcoin: number;
  bundle_price_gcoin: number;
  price_bp?: number | null;
  price_bp_limit?: number | null;
  ticket_currency_code?: string | null;
  ticket_price_single?: number | null;
  ticket_price_bundle?: number | null;
  bonus_currency_code?: string | null;
  bonus_amount_single?: number | null;
  bonus_amount_bundle?: number | null;
  image_url: string;
  description: string;
  items: CrateItem[];
  prime_parcel_items: PrimeParcelItem[];
  bonus_items?: BonusItem[];
  end_date?: string;
}

