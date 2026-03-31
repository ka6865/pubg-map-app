import {
  BASE_CAPACITY,
  calcBackpackCapacity,
  calcTotalWeight,
} from "../lib/backpackUtils";

describe("backpackUtils", () => {
  it("계산된 배낭 용량이 기본 공식과 일치해야 한다", () => {
    // hasVest: true, level 2 기준 (현재 UI 기본값과 동일)
    const capacity = calcBackpackCapacity(true, 2);
    // 기존 공식: BASE(70) + VEST(50) + LV2(200) = 320
    expect(capacity).toBe(BASE_CAPACITY + 50 + 200);
  });

  it("아이템 리스트의 총 무게를 정확히 합산해야 한다", () => {
    const items = [
      { weight: 10, quantity: 2 },
      { weight: 1.5, quantity: 10 },
    ];
    const total = calcTotalWeight(items);
    expect(total).toBeCloseTo(10 * 2 + 1.5 * 10, 5);
  });
});

