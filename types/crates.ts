export type CrateRarity = "ULTIMATE" | "LEGENDARY" | "EPIC" | "RARE";

export interface CrateItem {
  id: string;
  name: string;
  rarity: CrateRarity;
  probability: number;
  image_url: string;
  is_prime_parcel: boolean;
  token_count: number;
}

export interface PrimeParcelItem {
  id: string;
  name: string;
  rarity: CrateRarity;
  probability: number;
  image_url: string;
}

export interface BonusItem {
  id: string;
  name: string;
  probability: number;
  token_count: number;
  is_prime_parcel: boolean;
  is_extra_crate: boolean;
  image_url: string;
}

export interface CrateTemplate {
  id: string;
  name: string;
  type: "loot_crate" | "contraband";
  price_gcoin: number;
  bundle_price_gcoin: number;
  image_url: string;
  description: string;
  items: CrateItem[];
  prime_parcel_items: PrimeParcelItem[];
  bonus_items?: BonusItem[];
  end_date?: string;
}
