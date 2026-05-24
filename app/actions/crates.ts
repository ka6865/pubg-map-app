"use server";

import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

const cleanEnv = (val: string | undefined) => (val || '').replace(/['";\s]+/g, '').trim();

const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Create a static public client that does not use cookies()
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface CrateItem {
  id: string;
  name: string;
  rarity: "ULTIMATE" | "LEGENDARY" | "EPIC" | "RARE";
  probability: number;
  image_url: string;
  is_prime_parcel: boolean;
  token_count: number;
}

export interface PrimeParcelItem {
  id: string;
  name: string;
  rarity: "ULTIMATE" | "LEGENDARY" | "EPIC" | "RARE";
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

/**
 * 활성화 상태인 가챠 상자와 그 하위 구성품(1차/2차) 데이터를 Supabase에서 조회합니다.
 * unstable_cache를 활용해 7일 동안 캐싱하며, 'crate-data' 태그로 Revalidation을 지원합니다.
 */
export const getActiveCrates = unstable_cache(
  async (): Promise<CrateTemplate[]> => {
    try {
      // 1. 활성화 상태의 상자 템플릿 로드
      const { data: templates, error: templateError } = await supabase
        .from("crate_templates")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false });

      if (templateError || !templates) {
        throw new Error(templateError?.message || "Failed to load crate templates");
      }

      const result: CrateTemplate[] = [];

      for (const t of templates) {
        // 2. 1차 획득 아이템 목록 조회
        const { data: items, error: itemsError } = await supabase
          .from("crate_items")
          .select("*")
          .eq("crate_template_id", t.id)
          .order("probability", { ascending: false });

        if (itemsError) {
          console.error(`Error loading items for crate ${t.id}:`, itemsError.message);
        }

        // 3. 2차 최고급 꾸러미 아이템 목록 조회 (전리품 상자 전용)
        const { data: primeItems, error: primeError } = await supabase
          .from("prime_parcel_items")
          .select("*")
          .eq("crate_template_id", t.id)
          .order("probability", { ascending: false });

        if (primeError) {
          console.error(`Error loading prime parcel items for crate ${t.id}:`, primeError.message);
        }

        // 4. 보너스 구성품 목록 조회
        const { data: bonusItems, error: bonusError } = await supabase
          .from("bonus_items")
          .select("*")
          .eq("crate_template_id", t.id)
          .order("probability", { ascending: false });

        if (bonusError) {
          console.error(`Error loading bonus items for crate ${t.id}:`, bonusError.message);
        }

        result.push({
          id: t.id,
          name: t.name,
          type: t.type as "loot_crate" | "contraband",
          price_gcoin: t.price_gcoin,
          bundle_price_gcoin: t.bundle_price_gcoin,
          image_url: t.image_url || "",
          description: t.description || "",
          end_date: t.end_date,
          items: (items || []).map((item) => ({
            id: item.id,
            name: item.name,
            rarity: item.rarity as "ULTIMATE" | "LEGENDARY" | "EPIC" | "RARE",
            probability: Number(item.probability),
            image_url: item.image_url || "",
            is_prime_parcel: item.is_prime_parcel,
            token_count: item.token_count || 0,
          })),
          prime_parcel_items: (primeItems || []).map((pItem) => ({
            id: pItem.id,
            name: pItem.name,
            rarity: pItem.rarity as "ULTIMATE" | "LEGENDARY" | "EPIC" | "RARE",
            probability: Number(pItem.probability),
            image_url: pItem.image_url || "",
          })),
          bonus_items: (bonusItems || []).map((bItem) => ({
            id: bItem.id,
            name: bItem.name,
            probability: Number(bItem.probability),
            token_count: bItem.token_count || 0,
            is_prime_parcel: bItem.is_prime_parcel,
            is_extra_crate: bItem.is_extra_crate,
            image_url: bItem.image_url || "",
          })),
        });
      }

      return result;
    } catch (error) {
      console.error("Error inside getActiveCrates Server Action:", error);
      return [];
    }
  },
  ["active-crates-data"],
  {
    revalidate: 604800, // 7 days
    tags: ["crate-data"],
  }
);
