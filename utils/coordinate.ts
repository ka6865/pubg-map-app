interface Offset {
  x: number;
  y: number;
}

// 맵별 정밀 보정 오프셋 매핑 테이블 (1유닛 = 1m)
// 실측 랜드마크 비교를 통해 맵별로 개별 튜닝합니다.
export const MAP_OFFSETS: Record<string, Offset> = {
  erangel: { x: 3.5, y: -2.0 },  // 에란겔 실측치 (동쪽 +3.5m, 북쪽 +2.0m)
  miramar: { x: 15.0, y: 15.0 }, // 미라마 실측치 (동쪽 +15.0m, 남쪽 +15.0m)
  rondo: { x: 0.0, y: 0.0 },     // 론도 (추후 실측 예정)
  taego: { x: 0.0, y: 0.0 },     // 태이고 (추후 실측 예정)
  deston: { x: 0.0, y: 0.0 },    // 데스턴 (추후 실측 예정)
  vikendi: { x: 0.0, y: 0.0 },   // 비켄디 (추후 실측 예정)
  karakin: { x: 0.0, y: 0.0 },   // 카라킨 (추후 실측 예정)
  paramo: { x: 0.0, y: 0.0 },    // 파라모 (추후 실측 예정)
  haven: { x: 0.0, y: 0.0 }      // 헤이븐 (추후 실측 예정)
};

const DEFAULT_OFFSET: Offset = { x: 0.0, y: 0.0 };

/**
 * 펍지 텔레메트리 x, y 좌표를 맵별 타일셋 맞춤 오프셋을 반영하여
 * Leaflet 좌표계 [lat, lng]로 정밀 변환합니다.
 */
export function toCalibratedCoords(x: number, y: number, mapName?: string): [number, number] {
  if (!mapName) {
    const offset = MAP_OFFSETS.erangel;
    return [8192 - (y + offset.y), x + offset.x];
  }

  const mapKey = mapName.toLowerCase().replace(/[\s\-_]/g, "");
  let normalizedKey = mapKey;

  // 한글 및 영문 맵명 모두에 대응하여 표준화된 영문 맵 키로 변환합니다.
  if (mapKey.includes("baltic") || mapKey.includes("erangel") || mapKey.includes("에란겔")) {
    normalizedKey = "erangel";
  } else if (mapKey.includes("desert") || mapKey.includes("miramar") || mapKey.includes("미라마")) {
    normalizedKey = "miramar";
  } else if (mapKey.includes("neon") || mapKey.includes("rondo") || mapKey.includes("론도")) {
    normalizedKey = "rondo";
  } else if (mapKey.includes("tiger") || mapKey.includes("taego") || mapKey.includes("태이고")) {
    normalizedKey = "taego";
  } else if (mapKey.includes("kiki") || mapKey.includes("deston") || mapKey.includes("데스턴")) {
    normalizedKey = "deston";
  } else if (mapKey.includes("dihorotok") || mapKey.includes("vikendi") || mapKey.includes("비켄디")) {
    normalizedKey = "vikendi";
  } else if (mapKey.includes("summerland") || mapKey.includes("karakin") || mapKey.includes("카라킨")) {
    normalizedKey = "karakin";
  } else if (mapKey.includes("chimera") || mapKey.includes("paramo") || mapKey.includes("파라모")) {
    normalizedKey = "paramo";
  } else if (mapKey.includes("haven") || mapKey.includes("헤이븐")) {
    normalizedKey = "haven";
  }

  const offset = MAP_OFFSETS[normalizedKey] || DEFAULT_OFFSET;
  return [8192 - (y + offset.y), x + offset.x];
}
