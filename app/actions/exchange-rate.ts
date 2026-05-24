"use server";

import { unstable_cache } from "next/cache";

const FALLBACK_RATE = 1380.0;

/**
 * 실시간 USD to KRW 환율을 가져오며, Next.js unstable_cache를 사용해 24시간 동안 캐싱합니다.
 * 호출 실패 시 fallback 환율인 1380.0원을 반환합니다.
 */
export const getUSDtoKRWRate = unstable_cache(
  async (): Promise<number> => {
    try {
      // 10초 타임아웃을 지정하여 fetch 진행
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch("https://open.er-api.com/v6/latest/USD", {
        signal: controller.signal,
        next: { revalidate: 86400 } // Fetch 레벨에서도 하루 캐싱
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch exchange rate, status: ${response.status}`);
      }

      const data = await response.json();
      const rate = data.rates?.KRW;

      if (rate && typeof rate === "number") {
        return Math.round(rate * 100) / 100; // 소수점 2자리 반올림
      }
      return FALLBACK_RATE;
    } catch (error) {
      console.error("Error fetching exchange rate, using fallback:", error);
      return FALLBACK_RATE;
    }
  },
  ["usd-krw-exchange-rate"],
  {
    revalidate: 86400, // 24 hours
    tags: ["exchange-rate"],
  }
);
