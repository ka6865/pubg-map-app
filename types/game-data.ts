/**
 * @fileoverview 인게임 아이템(무기, 소비품, 차량 등)의 데이터 구조를 정의하는 타입 파일입니다.
 * DB 스키마 검증 및 백팩 인벤토리 시뮬레이터(장착/수납)에 활용됩니다.
 */

/** 게임 내 아이템의 대분류 카테고리 */
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
  type: "AR" | "DMR" | "SR" | "SMG" | "SG" | "HG" | "Melee" | "Other" | "LMG" | "ALL";
  bullet_speed?: number;
  availability?: string;
}

export interface Vehicle extends BaseGameItem {
  trunk_capacity: number;
}

export interface Consumable extends BaseGameItem {
  type?: string;
  heal_amount?: number;
  cast_time?: number;
}

export interface Ammo extends BaseGameItem {
  type: string;
}

export type GameItem = BaseGameItem | Weapon | Vehicle | Consumable | Ammo;
