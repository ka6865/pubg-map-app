/**
 * PUBG 분석 엔진 유틸리티 함수
 */

import { Location } from "./types";

export function normalizeName(name: string): string {
  if (!name) return "";
  // [V41.0] 대소문자 구분 없이 소문자로 처리하며, 공백/점/언더바를 제거하여 닉네임 불일치 방지 (가이드 표준)
  return name.toLowerCase().replace(/[\s\._]/g, "").trim();
}

export const calcDist3D = (l1: Location | any, l2: Location | any): number => {
  if (!l1 || !l2) return 999;
  const dx = l1.x - l2.x;
  const dy = l1.y - l2.y;
  const dz = (l1.z || 0) - (l2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export const getElapsedMinutes = (ts: number, startTime: number): number =>
  (ts - startTime) / 1000 / 60;

/**
 * 텔레메트리 좌표를 0~8192 지도 좌표로 변환
 */
export const scaleCoordinate = (val: number, mapSize: number): number => {
  if (!val || !mapSize) return 0;
  return (val / mapSize) * 8192;
};
