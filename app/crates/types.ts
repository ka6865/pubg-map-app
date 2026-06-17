import { CrateRarity } from "@/types/crates";

export interface DrawnCard {
  id: string;
  name: string;
  rarity: CrateRarity;
  image_url: string;
  isFromPrimeParcel: boolean;
  isBonus?: boolean;
  is_prime_parcel?: boolean;
  token_count?: number;
  bonus?: {
    id: string;
    name: string;
    rarity: CrateRarity;
    image_url: string;
    is_prime_parcel: boolean;
    is_extra_crate: boolean;
    token_count: number;
  };
}

export interface HistoryItem {
  id: string;
  name: string;
  rarity: CrateRarity;
  image_url: string;
  isFromPrimeParcel: boolean;
  isBonus: boolean;
  timestamp: Date;
}

export interface CraftableItem {
  name: string;
  tokenCost: number;
  image_url: string;
  rarity: CrateRarity;
  category: string;
}

