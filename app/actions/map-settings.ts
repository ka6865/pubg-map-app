'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

// =====================
// 맵 설정 (map_settings)
// =====================

/**
 * 모든 맵의 카테고리 설정을 조회합니다.
 */
export async function getMapSettings() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('map_settings').select('*');
  if (error) {
    console.error('[Action] getMapSettings error:', error.message);
    return [];
  }
  return data;
}

/**
 * 특정 맵의 카테고리 설정을 업데이트합니다.
 */
export async function updateMapSettings(mapId: string, categories: string[]) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('map_settings')
    .upsert(
      { map_id: mapId, categories, updated_at: new Date().toISOString() },
      { onConflict: 'map_id' }
    );
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/admin/map-settings');
  return { success: true };
}

// =====================
// 카테고리 마스터 (categories)
// =====================

export interface CategoryRow {
  id: string;
  label: string;
  color: string;
  icon_id: string;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
}

/**
 * 활성화된 카테고리만 조회 (일반 유저 화면용)
 */
export async function getCategories(): Promise<CategoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('[Action] getCategories error:', error.message);
    return [];
  }
  return data || [];
}

/**
 * 비활성 포함 전체 카테고리 조회 (관리자 화면용)
 */
export async function getAllCategories(): Promise<CategoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('[Action] getAllCategories error:', error.message);
    return [];
  }
  return data || [];
}

/**
 * 카테고리를 생성하거나 수정합니다.
 */
export async function upsertCategory(category: Omit<CategoryRow, 'created_at'>) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('categories')
    .upsert(category, { onConflict: 'id' });
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/admin/map-settings');
  return { success: true };
}

/**
 * 카테고리를 비활성화합니다. (소프트 삭제 - 기존 마커는 유지)
 */
export async function deactivateCategory(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('categories')
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/admin/map-settings');
  return { success: true };
}

/**
 * 비활성화된 카테고리를 다시 활성화합니다.
 */
export async function activateCategory(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('categories')
    .update({ is_active: true })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/admin/map-settings');
  return { success: true };
}
