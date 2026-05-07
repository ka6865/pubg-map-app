/**
 * PUBG 전술 분석 엔진 상수 정의
 */

export const RESULT_VERSION = 11.96; // [V11.9.6] 거리 계산 중복 보정 제거 및 반격 지표 최종 안정화
export const TELEMETRY_VERSION = 16;

export const MAP_NAMES: Record<string, string> = {
  "Baltic_Main": "에란겔", 
  "Savage_Main": "사녹", 
  "Desert_Main": "미라마",
  "Summerland_Main": "카라킨", 
  "Chimera_Main": "파라모", 
  "Tiger_Main": "태이고",
  "Kiki_Main": "데스턴", 
  "Neon_Main": "론도"
};

// 전술 지표 임계값
export const TACTICAL_THRESHOLDS = {
  ISOLATION_MAX_RATIO: 5,        // 고립 지수 최대값 클램핑
  STANDARD_ENGAGEMENT_DIST: 100, // 표준 교전 거리 (m)
  VERTICAL_ISOLATION_Z: 5,       // 수직 고립 판정 기준 (m)
  REACTION_WINDOW_MS: 5000,      // 반응 속도 측정 유효 시간
  TRADE_WINDOW_MS: 30000,        // 트레이드(복수) 유효 시간 (ID 매핑 실패 시 폴백용)
  EARLY_GAME_MIN: 5,             // 초반전 기준 (분)
  MID_GAME_1_MIN: 15,            // 중반전1 기준 (분)
  MID_GAME_2_MIN: 25,            // 중반전2 기준 (분)
};
