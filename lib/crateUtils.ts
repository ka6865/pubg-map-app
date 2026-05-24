import { CrateItem, PrimeParcelItem, BonusItem } from "../app/actions/crates";

// 가중치 기반 단일 기본 아이템 추첨
export const drawSingleItem = (items: CrateItem[]): CrateItem => {
  const totalProb = items.reduce((sum, item) => sum + item.probability, 0);
  let r = Math.random() * totalProb;
  for (const item of items) {
    if (r < item.probability) {
      return item;
    }
    r -= item.probability;
  }
  return items[items.length - 1];
};

// 가중치 기반 단일 최고급 꾸러미 아이템 추첨
export const drawSinglePrimeItem = (items: PrimeParcelItem[]): PrimeParcelItem => {
  const totalProb = items.reduce((sum, item) => sum + item.probability, 0);
  let r = Math.random() * totalProb;
  for (const item of items) {
    if (r < item.probability) {
      return item;
    }
    r -= item.probability;
  }
  return items[items.length - 1];
};

// 독립 확률 기반 보너스 드롭 추첨 (27.00% 확률)
export const tryDrawBonusItem = (bonusItems: BonusItem[]): BonusItem | null => {
  // 27% 확률로 보너스 당첨 여부 계산 (독립시행)
  const isBonusWon = Math.random() < 0.27;
  if (!isBonusWon) return null;

  // 보너스 아이템들 중 가중치 기반으로 당첨 구성품 결정
  const totalProb = bonusItems.reduce((sum, item) => sum + item.probability, 0);
  let r = Math.random() * totalProb;
  for (const item of bonusItems) {
    if (r < item.probability) {
      return item;
    }
    r -= item.probability;
  }
  return bonusItems[bonusItems.length - 1];
};
