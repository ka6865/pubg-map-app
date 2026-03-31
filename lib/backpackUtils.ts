export interface WeightItem {
  weight: number;
  quantity: number;
}

export const BASE_CAPACITY = 70;

export const getVestCapacity = (hasVest: boolean) => (hasVest ? 50 : 0);

export const getBackpackCapacityByLevel = (level: number) => {
  switch (level) {
    case 1:
      return 150;
    case 2:
      return 200;
    case 3:
      return 250;
    default:
      return 0;
  }
};

export const calcTotalWeight = (items: WeightItem[]): number =>
  items.reduce((acc, i) => acc + i.weight * i.quantity, 0);

export const calcBackpackCapacity = (hasVest: boolean, backpackLevel: number) =>
  BASE_CAPACITY + getVestCapacity(hasVest) + getBackpackCapacityByLevel(backpackLevel);

