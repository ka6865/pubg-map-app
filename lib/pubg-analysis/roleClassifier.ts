import { WEAPON_NAMES, IGNORE_WEAPONS } from "./constants";

/**
 * PUBG 전술 직업군 분류기 (Role Classifier)
 * 유저의 10경기 집계 데이터와 벤치마크를 기반으로 8종의 직업군 및 무기 시그니처를 판정합니다.
 */

export interface RoleScore {
  pointMan: number;         // 선봉대
  phantomOverwatch: number; // 저격 유령
  executor: number;         // 처형자
  shield: number;           // 팀의 방패
  zoneController: number;   // 전장 통제자
  dropPredator: number;     // 핫드랍 약탈자
  decoy: number;            // 미끼 전술가
  fieldCommander: number;   // 전장의 지휘관
}

export interface RoleInfo {
  primaryRole: keyof RoleScore;
  secondaryRole: keyof RoleScore | null;
  overallTier: string;
  title: string;
  roleLabel: string;
  description: string;
  signatureWeapon: string;
  signatureWeaponStats?: { kills: number; dbnos: number };
  scores: RoleScore;
}

const ROLE_LABELS: Record<keyof RoleScore, string> = {
  pointMan: "선봉대 (Point Man)",
  phantomOverwatch: "저격 유령 (Phantom Overwatch)",
  executor: "처형자 (Executor)",
  shield: "팀의 방패 (Shield)",
  zoneController: "전장 통제자 (Zone Controller)",
  dropPredator: "핫드랍 약탈자 (Drop Predator)",
  decoy: "미끼 전술가 (Decoy)",
  fieldCommander: "전장의 지휘관 (Field Commander)"
};

const ROLE_DESCRIPTIONS: Record<keyof RoleScore, string> = {
  pointMan: "항상 팀의 가장 앞에 서서 첫 총성을 울립니다. 빠른 반응 속도와 두려움 없는 진입이 특징입니다.",
  phantomOverwatch: "팀원과 거리를 유지하며 외곽에서 적의 허를 찌릅니다. 보이지 않는 곳에서 전장을 감시하는 망령입니다.",
  executor: "압도적인 1:1 무력으로 교전을 종결시킵니다. 불리한 상황에서도 역전승을 만들어내는 심판자입니다.",
  shield: "아군이 기절했을 때 가장 먼저 연막을 뿌리고 달려갑니다. 팀의 생존을 책임지는 든든한 수호신입니다.",
  zoneController: "자기장 경계선을 타고 움직이며 구역을 장악합니다. 적의 진입을 차단하고 유리한 위치를 절대 놓치지 않습니다.",
  dropPredator: "초반 핫드랍 지역에서 가장 먼저 킬을 올립니다. 혼돈 속에서도 냉정하게 적을 사냥하는 약탈자입니다.",
  decoy: "자신을 미끼로 던져 적의 위치를 노출시키고 양각을 만듭니다. 팀의 승리를 위해 희생을 두려워하지 않는 전략가입니다.",
  fieldCommander: "모든 지표가 균형 있게 높으며 팀을 승리로 이끕니다. 전장의 흐름을 완벽하게 읽고 통제하는 지휘관입니다."
};

/**
 * 시그니처 무기 및 상세 스탯 추출
 */
function getSignatureWeapon(weaponStats: Record<string, any>) {
  if (!weaponStats || Object.keys(weaponStats).length === 0) return { name: "주먹", stats: { kills: 0, dbnos: 0 } };

  const sorted = Object.entries(weaponStats)
    .filter(([id]) => !IGNORE_WEAPONS.includes(id))
    .sort((a, b) => {
      const scoreA = (a[1].kills || 0) * 2 + (a[1].dbnos || 0);
      const scoreB = (b[1].kills || 0) * 2 + (b[1].dbnos || 0);
      return scoreB - scoreA;
    });

  if (sorted.length === 0) return { name: "알 수 없음", stats: { kills: 0, dbnos: 0 } };
  
  const [bestId, stats] = sorted[0];
  return {
    name: WEAPON_NAMES[bestId] || bestId.replace(/Item_Weapon_|Weap|_C/g, ""),
    stats: { kills: stats.kills || 0, dbnos: stats.dbnos || 0 }
  };
}

/**
 * 8종 직업군 판정 로직
 */
export function classifyRole(stats: any, bench: any, overallTier: string): RoleInfo {
  const scores: RoleScore = {
    pointMan: 0,
    phantomOverwatch: 0,
    executor: 0,
    shield: 0,
    zoneController: 0,
    dropPredator: 0,
    decoy: 0,
    fieldCommander: 0
  };

  // 1. 선봉대 (Point Man)
  // 주도권 높음 + 대응 사격 빠름 + 팀과 붙어있음
  scores.pointMan = (stats.userInitiativeRate || 0) * 0.4 + 
                   (stats.avgReactionLatency < 0.5 ? 30 : 0) + 
                   (parseFloat(stats.avgIsolationStr) < 1.0 ? 30 : 0);

  // 2. 저격 유령 (Phantom Overwatch)
  // 최대 타격 거리 멂 + 주도권 높음 + 고립 지수 높음
  scores.phantomOverwatch = (stats.totalMaxHitDist > 200 ? 40 : 0) + 
                           (stats.userInitiativeRate || 0) * 0.3 + 
                           (parseFloat(stats.avgIsolationStr) > 1.5 ? 30 : 0);

  // 3. 처형자 (Executor)
  // 1:1 승률 높음 + 역전승 많음 + 팀 전멸 기여
  scores.executor = (stats.avgDuelWinRate || 0) * 0.5 + 
                    (stats.totalReversalWins || 0) * 10 + 
                    (stats.totalTeamWipes || 0) * 5;

  // 4. 팀의 방패 (Shield)
  // 부활/복수/연막 지원 지표 합산
  const supportRate = stats.totalTeammateKnocks > 0 ? 
    ((stats.totalRevCount + stats.totalTradeKills) / stats.totalTeammateKnocks) * 100 : 0;
  scores.shield = supportRate * 0.6 + (stats.totalSmokeCount || 0) * 5;

  // 5. 전장 통제자 (Zone Controller)
  // 엣지 플레이 + 자기장 피해 적음 + 압박 지수 높음
  scores.zoneController = (stats.totalEdgePlay || 0) * 10 + 
                         (200 - Math.min(200, stats.bluezoneWaste || 0)) * 0.2 + 
                         (stats.avgPressureIndex || 0) * 10;

  // 6. 핫드랍 약탈자 (Drop Predator)
  // 초반 데미지 비중 높음 + 초반 킬
  const earlyImpact = stats.goldenTimeAvg?.early || 0;
  scores.dropPredator = Math.min(100, earlyImpact / 2);

  // 7. 미끼 전술가 (Decoy)
  // 미끼 판정 횟수 + 기절 대비 복수 기여
  scores.decoy = (stats.totalBaitCount || 0) * 20 + 
                 (stats.totalSuppCount || 0) * 5;

  // 8. 전장의 지휘관 (Field Commander)
  // 모든 지표의 평균치 기반 (올라운더)
  scores.fieldCommander = (stats.avgDamage / 5) + (stats.avgDuelWinRate * 0.3) + (stats.avgCoverRate * 0.2);

  // 최고 점수 직업 선정
  const sortedRoles = (Object.entries(scores) as [keyof RoleScore, number][])
    .sort((a, b) => b[1] - a[1]);

  const primaryRole = sortedRoles[0][0];
  const secondaryRole = sortedRoles[1][1] > 10 ? sortedRoles[1][0] : null;

  // 시그니처 무기 추출
  const weapon = getSignatureWeapon(stats.weaponStatsFinal || {});

  // 칭호 및 텍스트 생성 (한글 명칭 전체 추출)
  const roleNameOnly = ROLE_LABELS[primaryRole].replace(/\s*\(.*\)/, "");
  const title = `${weapon.name}의 화신, ${roleNameOnly}`;

  return {
    primaryRole,
    secondaryRole,
    overallTier,
    title,
    roleLabel: ROLE_LABELS[primaryRole],
    description: ROLE_DESCRIPTIONS[primaryRole],
    signatureWeapon: weapon.name,
    signatureWeaponStats: weapon.stats,
    scores
  };
}
