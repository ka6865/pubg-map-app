/**
 * @fileoverview PUBG 맵에 사용되는 각종 차량/이동수단/아이템의 아이콘 SVG 패스 및 
 * 카테고리 정보, 맵별 스폰 필터링 정보를 관리하는 설정 파일입니다.
 */

/**
 * 맵 아이콘에 사용될 SVG 경로 모음
 */
export const svgPaths = {
    car: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
    boat: "M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.39-.6-.39H2.72c-.26 0-.5.15-.6.39s-.14.52-.06.78L3.95 19z",
    glider: "M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z",
    key: "M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"
  };
  
/**
 * 각 마커 카테고리별 출력 정보 (라벨, 색상, SVG경로, 이모지)
 */
export const CATEGORY_INFO: Record<string, { label: string; color: string; path: string; iconType: string }> = {
    Garage: { label: '차고지', color: '#ef4444', path: svgPaths.car, iconType: '🏠' },
    Esports: { label: '고정 차량', color: '#a855f7', path: svgPaths.car, iconType: '🏆' },
    Boat: { label: '보트', color: '#3b82f6', path: svgPaths.boat, iconType: '🚤' },
    EsportsBoat: { label: '고정 보트', color: '#8b5cf6', path: svgPaths.boat, iconType: '🏆' },
    Glider: { label: '글라이더', color: '#f97316', path: svgPaths.glider, iconType: '🪂' },
    Key: { label: '비밀 열쇠', color: '#10b981', path: svgPaths.key, iconType: '🔑' },
    
    GoldenMirado: { label: '황금 미라도', color: '#eab308', path: svgPaths.car, iconType: '👑' }, // 노란색
    EsportsMirado: { label: 'e스포츠 미라도', color: '#a855f7', path: svgPaths.car, iconType: '🏆' }, // 진보라색
    EsportsPickup: { label: 'e스포츠 픽업', color: '#d8b4fe', path: svgPaths.car, iconType: '🛻' }, // 연보라/핑크색
    
    Porter: { label: '포터', color: '#14b8a6', path: svgPaths.car, iconType: '🚚' },
    SecretRoom: { label: '비밀의 방', color: '#10b981', path: svgPaths.key, iconType: '🏺' },
    PoliceCar: { label: '경찰차', color: '#3b82f6', path: svgPaths.car, iconType: '🚓' },
    // Airboat: { label: '에어보트', color: '#06b6d4', path: svgPaths.boat, iconType: '🚁' },
    SecurityCard: { label: '보안 키카드', color: '#10b981', path: svgPaths.key, iconType: '💳' },
    GasPump: { label: '주유기', color: '#84cc16', path: svgPaths.car, iconType: '⛽' },
    Snowmobile: { label: '스노우모빌', color: '#0ea5e9', path: svgPaths.car, iconType: '🏂' },
  };
  
/**
 * 각 맵 고유의 특성에 따라 렌더링될 카테고리 목록 (예: 에란겔에는 빙하/스노우모빌이 없음)
 */
export const MAP_CATEGORIES: Record<string, string[]> = {
    Erangel: ['Garage', 'Esports', 'EsportsBoat', 'Glider', 'Key'],
    Miramar: ['GoldenMirado', 'EsportsMirado', 'EsportsPickup', 'EsportsBoat', 'Glider'], 
    Taego: ['Garage', 'Porter', 'Boat', 'SecretRoom'],
    Deston: ['Garage', 'PoliceCar', 'Boat', 'Glider'],
    Vikendi: ['Garage', 'Snowmobile', 'Esports', 'Boat', 'Key'],
    Rondo: ['Esports', 'Boat', 'Glider']
  };