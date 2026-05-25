import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

const supabaseAdmin = createSupabaseAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * PUBG API 응답 헤더에서 Rate Limit 정보를 추출하여 DB에 저장합니다.
 * 사용자 응답 속도에 영향을 주지 않도록 비동기 백그라운드로 실행됩니다.
 */
export function trackPubgRateLimit(headers: Headers): void {
  try {
    const limitStr = headers.get("X-Ratelimit-Limit");
    const remainingStr = headers.get("X-Ratelimit-Remaining");
    const resetStr = headers.get("X-Ratelimit-Reset");

    if (!limitStr || !remainingStr || !resetStr) {
      return;
    }

    const limit = parseInt(limitStr, 10);
    const remaining = parseInt(remainingStr, 10);
    const resetEpoch = parseInt(resetStr, 10); // Epoch seconds

    if (isNaN(limit) || isNaN(remaining) || isNaN(resetEpoch)) {
      return;
    }

    const resetAt = new Date(resetEpoch * 1000).toISOString();

    // 백그라운드 비동기 처리 및 에러 캐치
    supabaseAdmin
      .from("pubg_api_status")
      .insert({
        api_limit: limit,
        remaining: remaining,
        reset_at: resetAt
      })
      .then(({ error }) => {
        if (error) {
          console.error("[PUBG Rate Limit Tracker Error]:", error);
        }
      });
  } catch (err) {
    console.error("[PUBG Rate Limit Tracker Unexpected Error]:", err);
  }
}
