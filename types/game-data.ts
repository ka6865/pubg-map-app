export type ItemCategory = "weapons" | "consumables" | "throwables" | "attachments" | "ammo" | "vehicles";

export interface BaseGameItem {
  id: string;
  name: string;
  patch_notes?: string;
  weight?: number;
  can_be_in_backpack?: boolean;
}

export interface Weapon extends BaseGameItem {
  damage?: number;
  ammo?: string;
  category: "AR" | "DMR" | "SR" | "SMG" | "SG" | "HG" | "Melee" | "Other";
}

export interface Vehicle extends BaseGameItem {
  trunk_capacity: number;
}

export interface Consumable extends BaseGameItem {
  heal_amount?: number;
  cast_time?: number;
}

export type GameItem = BaseGameItem | Weapon | Vehicle | Consumable;
