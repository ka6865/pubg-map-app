/**
 * PUBG 전술 분석 엔진 상수 정의
 */

export const RESULT_VERSION = 26.1; // [V26.7] recordStunEvent 통합 로직 - 적군 섬광 피격 추적 추가
export const TELEMETRY_VERSION = 40; // [V40.0] 부활 감지 이벤트 리스트 확장 (LogPlayerRecall 추가) 및 캐시 갱신

export const MAP_NAMES: Record<string, string> = {
  "Baltic_Main": "에란겔", 
  "Savage_Main": "사녹", 
  "Desert_Main": "미라마",
  "Summerland_Main": "카라킨", 
  "Chimera_Main": "파라모", 
  "Tiger_Main": "태이고",
  "Kiki_Main": "데스턴", 
  "Neon_Main": "론도",
  "DihorOtok_Main": "비켄디"
};

export const MAP_SIZES: Record<string, number> = {
  baltic: 819200, erangel: 819200,
  desert: 819200, miramar: 819200,
  tiger: 819200, taego: 819200,
  kiki: 819200, deston: 819200,
  neon: 819200, rondo: 819200,
  dihorotok: 819200, vikendi: 819200,
  savage: 409600, sanhok: 409600,
  chimera: 307200, paramo: 307200,
  summerland: 204800, karakin: 204800,
  haven: 102400
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
  "WeapM416_C": "M416", "WeapHK416_C": "M416", "HK416": "M416", "M416": "M416",
  "WeapSCAR-L_C": "SCAR-L", "WeapAKM_C": "AKM", "WeapBerylM762_C": "베릴 M762", "BerylM762": "베릴 M762",
  "WeapM16A4_C": "M16A4", "WeapMk47Mutant_C": "뮤턴트", "WeapG36C_C": "G36C", "WeapK2_C": "K2", "WeapACE32_C": "ACE32",
  "WeapAUG_C": "AUG", "WeapGroza_C": "그로자", "WeapFAMAS_C": "파마스",
  
  // SR
  "WeapKar98k_C": "Kar98k", "WeapM24_C": "M24", "WeapMosinnagant_C": "모신나강", "WeapWin94_C": "Win94", "WeapAWM_C": "AWM",
  "WeapL6_C": "링스 AMR", "L6": "링스 AMR", "LynxAMR": "링스 AMR", "l6": "링스 AMR", "weapL6_C": "링스 AMR",
  
  // DMR
  "WeapSKS_C": "SKS", "WeapSLR_C": "SLR", "WeapMini14_C": "Mini14", "WeapMk14_C": "Mk14", "WeapQBU88_C": "QBU", "WeapVSS_C": "VSS", "WeapDragunov_C": "드라구노프",
  
  // SMG
  "WeapUZI_C": "마이크로 UZI", "WeapUMP45_C": "UMP45", "WeapVector_C": "벡터", "WeapTommyGun_C": "토미건", "WeapMP5K_C": "MP5K", "WeapP90_C": "P90", "WeapJS9_C": "JS9",
  
  // SG
  "WeapS12K_C": "S12K", "WeapS1897_C": "S1897", "WeapS686_C": "S686", "WeapDBS_C": "DBS", 
  
  // LMG / Others
  "WeapM249_C": "M249", "WeapDP28_C": "DP-28", "WeapMG3_C": "MG3", "WeapOriginS12_C": "O12",
  "WeapPanzerFaust100M_C": "판처파우스트", "PanzerFaust100M_Projectile_C": "판처파우스트", "PanzerFaust100M_Projectile": "판처파우스트", "WeapMortar_C": "박격포", "WeapCrossbow_C": "석궁",
  
  // Damage Types
  "Damage_BlueZone": "자기장", "Damage_Falling": "낙사", "Damage_Drowning": "익사", "Damage_Groggy": "출혈(기절)", "Damage_Gunshot": "총기", "Damage_Explosion": "폭발",
  
  // Vehicles
  "Vehicle_Dacia_C": "다시아", "Vehicle_UAZ_C": "UAZ", "Vehicle_CoupeRB_C": "쿠페 RB", "BP_CoupeRB_C": "쿠페 RB", "CoupeRB": "쿠페 RB", "BPoupeRB": "쿠페 RB",
  "Vehicle_Motorbike_C": "오토바이", "Vehicle_Zima_C": "지마", "Vehicle_Porter_C": "포터", "Vehicle_PonyCoupe_C": "포니 쿠페", "BP_PonyCoupe_C": "포니 쿠페",
  "Vehicle_Mirado_C": "미라도", "Vehicle_TukTuk_C": "툭툭", "Vehicle_Rony_C": "로니", "Vehicle_Pickup_C": "픽업트럭",
  "Vehicle_BRDM_C": "BRDM", "Vehicle_LootTruck_C": "보급 트럭", "Vehicle_AquaRail_C": "아쿠아레일", "Vehicle_PG117_C": "보트",
  "Vehicle": "차량",
  
  // Items
  "Item_Weapon_C4_C": "C4", "Item_Heal_FirstAid_C": "구급상자", "Item_Heal_MedKit_C": "의료용 키트",
  "Item_Heal_Bandage_C": "붕대", "Item_Boost_EnergyDrink_C": "에너지 드링크", "Item_Boost_PainKiller_C": "진통제",
  "Item_Boost_AdrenalineSyringe_C": "아드레날린 주사기",
  
  // Projectiles & Throwables
  "ProjGrenade_C": "수류탄", "ProjMolotov_C": "화염병", "ProjSmokeBomb_C": "연막탄", "ProjFlashBang_C": "섬광탄",
  "ProjBluezoneGrenade_C": "블루존 수류탄", "ProjStickyGrenade_C": "점착 폭탄", "ProjC4_C": "C4",
  "Item_Weapon_Grenade_C": "수류탄", "item_weapon_grenade_c": "수류탄", "grenade": "수류탄",
  "Item_Weapon_Molotov_C": "화염병", "item_weapon_molotov_c": "화염병", "molotov": "화염병",
  "Item_Weapon_SmokeBomb_C": "연막탄", "item_weapon_smokebomb_c": "연막탄", "smoke": "연막탄",
  "Item_Weapon_FlashBang_C": "섬광탄", "item_weapon_flashbang_c": "섬광탄", "flash": "섬광탄",
  "Item_Weapon_BluezoneGrenade_C": "블루존 수류탄", "item_weapon_bluezonegrenade_c": "블루존 수류탄",
  "Item_Weapon_StickyGrenade_C": "점착 폭탄", "item_weapon_stickygrenade_c": "점착 폭탄",
  "item_weapon_c4_c": "C4", "c4": "C4",
  
  // New Utilities
  "Item_Weapon_M79_C": "M79 연막탄", "item_weapon_m79_c": "M79 연막탄",
  "Item_Weapon_CoverStructDropHandFlare_C": "비상 엄폐물", "item_weapon_coverstructdrophandflare_c": "비상 엄폐물",
  "Item_Weapon_MountainBike_C": "접이식 자전거", "item_weapon_mountainbike_c": "접이식 자전거",
  
  "Melee": "근접 무기", "Punch": "주먹", "BlueZone": "자기장", "None": "없음"
};

/**
 * 분석에서 제외할 무기 (투척물, 주먹 등)
 */
export const IGNORE_WEAPONS = [
  "WeapGrenade_C", "WeapMolotov_C", "WeapSmokeBomb_C", "WeapFlashBang_C", "WeapStickyGrenade_C",
  "WeapSpikeStrip_C", "WeapDecoyGrenade_C", "WeapBluezoneGrenade_C", "None", "Cowbar_C", "Pan_C"
];
