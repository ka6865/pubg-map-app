/**
 * PUBG 전술 분석 엔진 상수 정의
 */

export const RESULT_VERSION = 11.97;
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

export const WEAPON_NAMES: Record<string, string> = {
  // AR
  "WeapBerylM762_C": "베릴 M762", "WeapAKM_C": "AKM", "WeapM416_C": "M416", "WeapSCAR-L_C": "SCAR-L", 
  "WeapG36C_C": "G36C", "WeapQBZ95_C": "QBZ95", "WeapAUG_C": "AUG", "WeapGroza_C": "그로자",
  "WeapK2_C": "K2", "WeapACE32_C": "ACE32", "WeapFAMAS_C": "FAMAS",

  // DMR
  "WeapSLR_C": "SLR", "WeapSKS_C": "SKS", "WeapMk14_C": "Mk14", "WeapMini14_C": "Mini14", 
  "WeapQBU88_C": "QBU", "WeapVSS_C": "VSS", "WeapMk12_C": "Mk12", "WeapDragunov_C": "드라구노프",

  // SR
  "WeapKar98k_C": "Kar98k", "WeapM24_C": "M24", "WeapAWM_C": "AWM", "WeapMosin_C": "모신나강", "WeapWin94_C": "Win94",

  // SMG
  "WeapUMP_C": "UMP45", "WeapVector_C": "Vector", "WeapMicroUZI_C": "Micro UZI", "WeapTommyGun_C": "토미건", 
  "WeapBizon_C": "비존", "WeapMP5K_C": "MP5K", "WeapP90_C": "P90", "WeapJS9_C": "JS9",

  // SG / Others
  "WeapS12K_C": "S12K", "WeapS1897_C": "S1897", "WeapS686_C": "S686", "WeapDBS_C": "DBS", 
  "WeapM249_C": "M249", "WeapDP28_C": "DP-28", "WeapMG3_C": "MG3", "WeapOriginS12_C": "O12",
  "WeapPanzerFaust100M_C": "판처파우스트", "WeapMortar_C": "박격포", "WeapCrossbow_C": "석궁"
};

/**
 * 분석에서 제외할 무기 (투척물, 주먹 등)
 */
export const IGNORE_WEAPONS = [
  "WeapGrenade_C", "WeapMolotov_C", "WeapSmokeBomb_C", "WeapFlashBang_C", "WeapStickyGrenade_C",
  "WeapSpikeStrip_C", "WeapDecoyGrenade_C", "WeapBluezoneGrenade_C", "None", "Cowbar_C", "Pan_C"
];
