"use client";

import { useState, useEffect, useCallback } from "react";
import { MAP_CATEGORIES, CATEGORY_INFO, ICON_LIBRARY } from "../lib/map_config";
import { getMapSettings, getCategories } from "../app/actions/map-settings";
import type { CategoryRow } from "../app/actions/map-settings";

// CATEGORY_INFO와 동일한 형태로 변환하기 위한 타입
export type CategoryInfoMap = Record<string, {
  label: string;
  color: string;
  path: string;
  iconType: string;
}>;

/**
 * DB의 categories 테이블 데이터를 CATEGORY_INFO 형태로 변환합니다.
 * DB 데이터가 없거나 오류 시 기존 하드코딩 데이터를 폴백으로 사용합니다.
 */
function convertCategoryRowsToCategoryInfo(rows: CategoryRow[]): CategoryInfoMap {
  const result: CategoryInfoMap = {};
  rows.forEach((row) => {
    const iconDef = ICON_LIBRARY[row.icon_id];
    result[row.id] = {
      label: row.label,
      color: row.color,
      path: iconDef?.path || ICON_LIBRARY['car'].path,
      iconType: iconDef?.emoji || '📍',
    };
  });
  return result;
}

/**
 * 맵별 활성 카테고리 설정 + 카테고리 마스터 정보를 관리하는 훅입니다.
 * DB 설정을 우선하며, 데이터가 없을 경우 lib/map_config.ts의 기본값을 사용합니다.
 */
export function useMapSettings(activeMapId: string) {
  // 맵별 활성 카테고리 ID 배열 (map_settings 테이블)
  const [mapSettings, setMapSettings] = useState<Record<string, string[]>>(MAP_CATEGORIES);
  // 카테고리 마스터 정보 (categories 테이블)
  const [categoryInfoMap, setCategoryInfoMap] = useState<CategoryInfoMap>(CATEGORY_INFO);
  const [isLoading, setIsLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      // 병렬로 두 데이터를 모두 가져옴
      const [mapSettingsData, categoriesData] = await Promise.all([
        getMapSettings(),
        getCategories(),
      ]);

      // 맵별 설정 처리
      if (mapSettingsData && mapSettingsData.length > 0) {
        const dbSettingsMap: Record<string, string[]> = { ...MAP_CATEGORIES };
        mapSettingsData.forEach((item: any) => {
          dbSettingsMap[item.map_id] = item.categories;
        });
        setMapSettings(dbSettingsMap);
      }

      // 카테고리 마스터 처리
      if (categoriesData && categoriesData.length > 0) {
        const converted = convertCategoryRowsToCategoryInfo(categoriesData);
        setCategoryInfoMap(converted);
      }
    } catch (err) {
      console.error("[useMapSettings] 설정 로드 실패:", err);
      // 실패 시 하드코딩 기본값 유지
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // 현재 활성화된 맵의 카테고리 ID 배열
  const activeCategories =
    mapSettings[activeMapId] ||
    MAP_CATEGORIES[activeMapId] ||
    MAP_CATEGORIES["Erangel"];

  return {
    mapSettings,
    activeCategories,
    categoryInfoMap,
    isLoading,
    refresh: loadSettings,
  };
}
