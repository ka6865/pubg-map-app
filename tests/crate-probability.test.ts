import { describe, it, expect } from "vitest";

// 가중치 기반 단일 아이템 추첨 로직 (CratesClient.tsx에 있는 것과 동일)
function drawSingleItem<T extends { probability: number }>(items: T[]): T {
  const totalProb = items.reduce((sum, item) => sum + item.probability, 0);
  let r = Math.random() * totalProb;
  for (const item of items) {
    if (r < item.probability) {
      return item;
    }
    r -= item.probability;
  }
  return items[items.length - 1];
}

// 독립 확률 기반 보너스 드롭 추첨 로직 (CratesClient.tsx에 있는 것과 동일)
function tryDrawBonusItem<T extends { probability: number }>(bonusItems: T[]): T | null {
  const isBonusWon = Math.random() < 0.27;
  if (!isBonusWon) return null;

  const totalProb = bonusItems.reduce((sum, item) => sum + item.probability, 0);
  let r = Math.random() * totalProb;
  for (const item of bonusItems) {
    if (r < item.probability) {
      return item;
    }
    r -= item.probability;
  }
  return bonusItems[bonusItems.length - 1];
}

describe("PUBG 상자깡 시뮬레이터 확률 수렴성 테스트", () => {
  // 1. 할리데이비슨 전리품 상자 기본 구성품
  const harleyBaseItems = [
    { name: "의상 및 장비 도안", probability: 0.300000 },
    { name: "세트 도안", probability: 0.700000 }
  ];

  // 2. 할리데이비슨 보너스 구성품 (독립 27% 당첨 시 개별 가중치 확률)
  const harleyBonusItems = [
    { name: "할리데이비슨™ 최고급 꾸러미", probability: 0.065000 },
    { name: "할리데이비슨™ 토큰 x10", probability: 0.100000 },
    { name: "[에픽 이상] 의상 및 장비 획득권", probability: 0.005000 },
    { name: "할리데이비슨™ 전리품 상자", probability: 0.100000 }
  ];

  // 3. 할리데이비슨 최고급 꾸러미 최종 23종 구성품
  const harleyPrimeItems = [
    { name: "할리데이비슨™ 토큰 x50", probability: 0.100000 },
    { name: "할리데이비슨™ 토큰 x75", probability: 0.100000 },
    { name: "할리데이비슨™ 토큰 x100", probability: 0.100000 },
    { name: "할리데이비슨™ 토큰 x125", probability: 0.100000 },
    { name: "할리데이비슨™ 토큰 x150", probability: 0.100000 },
    { name: '"CVO™ Road Glide® ST (리미티드)" 모터사이클 도안', probability: 0.012000 },
    { name: '"CVO™ Road Glide® ST" 모터사이클 도안', probability: 0.040000 },
    { name: "CVO™ ROAD GLIDE® ST (리미티드) 풀 세트 (골든 네이비 & 샴페인 골드) 도안", probability: 0.012500 },
    { name: "CVO™ ROAD GLIDE® ST (리미티드) 세트 (미드나잇 블레이즈 & 폴리시드 크롬) 도안", probability: 0.013000 },
    { name: "CVO™ ROAD GLIDE® ST (리미티드) 세트 (브론즈 플레임 & 액센티드 브론즈) 도안", probability: 0.014000 },
    { name: "CVO™ ROAD GLIDE® ST (리미티드) SET (볼드 아이보리 & 액센티드 글로스 BLACK) 도안", probability: 0.014000 },
    { name: "CVO™ ROAD GLIDE® ST 세트 (매트 나이트셰이드 & 알루미늄) 도안", probability: 0.014500 },
    { name: "CVO™ Road Glide® ST (리미티드) 페인트 (샴페인 골드) 도안", probability: 0.015000 },
    { name: "CVO™ Road Glide® ST 페인트 (팬텀 포레스트) 도안", probability: 0.016000 },
    { name: "CVO™ Road Glide® ST 페인트 (터콰이즈 타이드) 도안", probability: 0.017000 },
    { name: "CVO™ Road Glide® ST 페인트 (골든 화이트 펄) 도안", probability: 0.017000 },
    { name: "CVO™ Road Glide® ST 페인트 (일렉트릭 코스트) 도안", probability: 0.017000 },
    { name: "할리데이비슨® 블랙탑 바이커 세트 도안", probability: 0.060000 },
    { name: "할리데이비슨® 스트리트 스마트 세트 도안", probability: 0.060000 },
    { name: "할리데이비슨® 낙하산 도안", probability: 0.041000 },
    { name: "할리데이비슨® - 클로즈 업 도안", probability: 0.041000 },
    { name: "할리데이비슨™ - 달리기 위해 살고, 살기 위해 달린다 도안", probability: 0.046000 },
    { name: "할리데이비슨® 엔진 배지 도안", probability: 0.050000 }
  ];

  // 4. 라이드 오어 다이 밀수품 상자 구성품 확률 데이터
  const rideOrDieContrabandItems = [
    { name: "라이드 오어 다이 - M249", probability: 0.009000 },
    { name: "라이드 오어 다이 - M249 (블랙 틸)", probability: 0.004000 },
    { name: "도면 (Schematic)", probability: 0.009000 },
    { name: "폴리머 (Polymer) x50", probability: 0.076300 },
    { name: "폴리머 (Polymer) x100", probability: 0.025000 },
    { name: "폴리머 (Polymer) x200", probability: 0.010000 },
    { name: "러프 라이드 - S12K", probability: 0.015000 },
    { name: "다이너스티 - Kar98k", probability: 0.008000 },
    { name: "프랙처 엘리먼트 - AKM", probability: 0.008000 },
    { name: "프랙처 엘리먼트 - 미니14", probability: 0.008000 },
    { name: "러프 라이드 - 베릴 M762", probability: 0.030000 },
    { name: "러프 라이드 - 토미 건", probability: 0.030000 },
    // 나머지 스킨류 및 토큰/클래식 스킨 그룹들의 가중치 합산 (1.0 - 0.2333 = 0.7667)
    { name: "기타 클래식 및 서브 스킨군", probability: 0.766700 }
  ];


  it("할리데이비슨 전리품 상자 기본 구성품 - 50,000회 개봉 시 확률 수렴 검증", () => {
    const trials = 50000;
    const counts: Record<string, number> = {
      "의상 및 장비 도안": 0,
      "세트 도안": 0
    };

    for (let i = 0; i < trials; i++) {
      const selected = drawSingleItem(harleyBaseItems);
      counts[selected.name]++;
    }

    harleyBaseItems.forEach(item => {
      const expectedRatio = item.probability;
      const actualRatio = counts[item.name] / trials;
      const absoluteError = Math.abs(expectedRatio - actualRatio);
      expect(absoluteError).toBeLessThan(0.015);
      console.log(`[할리 기본] ${item.name} -> 기댓값: ${(expectedRatio * 100).toFixed(2)}%, 실측값: ${(actualRatio * 100).toFixed(2)}% (절대오차: ${(absoluteError * 100).toFixed(4)}%)`);
    });
  });

  it("할리데이비슨 전리품 상자 보너스 구성품 - 50,000회 독립 시행 시 확률 수렴 검증", () => {
    const trials = 50000;
    const counts: Record<string, number> = {
      "할리데이비슨™ 최고급 꾸러미": 0,
      "할리데이비슨™ 토큰 x10": 0,
      "[에픽 이상] 의상 및 장비 획득권": 0,
      "할리데이비슨™ 전리품 상자": 0
    };
    let totalBonusWon = 0;

    for (let i = 0; i < trials; i++) {
      const bonus = tryDrawBonusItem(harleyBonusItems);
      if (bonus) {
        totalBonusWon++;
        counts[bonus.name]++;
      }
    }

    // 보너스 총 당첨 확률 검증 (기댓값: 27.00%)
    const expectedBonusProb = 0.27;
    const actualBonusProb = totalBonusWon / trials;
    const bonusError = Math.abs(expectedBonusProb - actualBonusProb);
    expect(bonusError).toBeLessThan(0.015);
    console.log(`[보너스 당첨율] 기댓값: 27.00%, 실측값: ${(actualBonusProb * 100).toFixed(2)}% (절대오차: ${(bonusError * 100).toFixed(4)}%)`);

    // 개별 보너스 품목 획득 확률 검증
    harleyBonusItems.forEach(item => {
      const expectedRatio = item.probability; // 전체 시행 중 획득 기댓값 (예: 최고급 꾸러미는 6.5%)
      const actualRatio = counts[item.name] / trials;
      const absoluteError = Math.abs(expectedRatio - actualRatio);
      expect(absoluteError).toBeLessThan(0.015);
      console.log(`[보너스 품목] ${item.name} -> 기댓값: ${(expectedRatio * 100).toFixed(2)}%, 실측값: ${(actualRatio * 100).toFixed(2)}% (절대오차: ${(absoluteError * 100).toFixed(4)}%)`);
    });
  });

  it("할리데이비슨 최고급 꾸러미 최종 스킨 5종 - 50,000회 개봉 시 확률 수렴 검증", () => {
    const trials = 50000;
    const counts: Record<string, number> = {};

    harleyPrimeItems.forEach(item => {
      counts[item.name] = 0;
    });

    for (let i = 0; i < trials; i++) {
      const selected = drawSingleItem(harleyPrimeItems);
      counts[selected.name]++;
    }

    harleyPrimeItems.forEach(item => {
      const expectedRatio = item.probability;
      const actualRatio = counts[item.name] / trials;
      const absoluteError = Math.abs(expectedRatio - actualRatio);
      expect(absoluteError).toBeLessThan(0.015);
      console.log(`[꾸러미 최종] ${item.name} -> 기댓값: ${(expectedRatio * 100).toFixed(2)}%, 실측값: ${(actualRatio * 100).toFixed(2)}% (절대오차: ${(absoluteError * 100).toFixed(4)}%)`);
    });
  });

  it("라이드 오어 다이 밀수품 상자 - 50,000회 모의 개봉 시 통계적 확률 수렴 검증", () => {
    const trials = 50000;
    const counts: Record<string, number> = {};

    rideOrDieContrabandItems.forEach(item => {
      counts[item.name] = 0;
    });

    for (let i = 0; i < trials; i++) {
      const selected = drawSingleItem(rideOrDieContrabandItems);
      counts[selected.name]++;
    }

    rideOrDieContrabandItems.forEach(item => {
      const expectedRatio = item.probability;
      const actualRatio = counts[item.name] / trials;
      const absoluteError = Math.abs(expectedRatio - actualRatio);
      expect(absoluteError).toBeLessThan(0.015);
      console.log(`[라이드 오어 다이] ${item.name} -> 기댓값: ${(expectedRatio * 100).toFixed(2)}%, 실측값: ${(actualRatio * 100).toFixed(2)}% (절대오차: ${(absoluteError * 100).toFixed(4)}%)`);
    });
  });
});
