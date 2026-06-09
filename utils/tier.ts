/**
 * PUBG 랭크 티어 이름과 subTier를 조합하여 로컬 에셋 이미지 경로를 반환합니다.
 * @param tier 랭크 티어 이름 (예: "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master", "Survivor", "Unranked" 등)
 * @param subTier 서브 티어 번호 (예: "1", "2", "3", "4", "5" 등)
 */
export function getTierIconPath(tier?: string, subTier?: string | number): string {
  if (!tier || tier === "일반전" || tier === "Unranked") {
    return "/assets/rank/Unranked.webp";
  }

  // 첫 글자 대문자, 나머지 소문자로 규격화
  const cleanTier = tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();

  // Master 및 Survivor는 subTier가 없음
  if (cleanTier === "Master" || cleanTier === "Survivor") {
    return `/assets/rank/${cleanTier}.webp`;
  }

  // 펍지플러스 랭크 아이콘은 Bronze-1, Platinum-5 형태로 매핑되어 있음
  // subTier가 유효한 범위(1~5)인 경우
  const sub = subTier?.toString();
  if (sub && ["1", "2", "3", "4", "5"].includes(sub)) {
    return `/assets/rank/${cleanTier}-${sub}.webp`;
  }

  // subTier가 없거나 범위 밖인 경우 기본적으로 1티어로 폴백
  return `/assets/rank/${cleanTier}-1.webp`;
}
