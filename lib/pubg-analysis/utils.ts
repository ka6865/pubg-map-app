/**
 * PUBG 분석 엔진 유틸리티 함수
 */

import { Location } from "./types";

export const normalizeName = (name: string): string => 
  name?.toLowerCase().trim() || "";

export const calcDist3D = (l1: Location | any, l2: Location | any): number => {
  if (!l1 || !l2) return 999;
  const dx = l1.x - l2.x;
  const dy = l1.y - l2.y;
  const dz = (l1.z || 0) - (l2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export const getElapsedMinutes = (ts: number, startTime: number): number => 
  (ts - startTime) / 1000 / 60;
