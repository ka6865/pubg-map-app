import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

const supabaseAdmin = createSupabaseAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Gemini AI 사용량을 기록하고 단가에 맞춰 USD 비용을 산출하여 DB에 저장합니다.
 * 백그라운드 비동기로 수행되어 API 응답을 지연시키지 않습니다.
 */
export function trackAiUsage(
  userId: string | undefined,
  modelName: string,
  promptTokens: number,
  completionTokens: number,
  analysisType: "analyze" | "summary"
): void {
  try {
    if (!promptTokens && !completionTokens) return;

    // Gemini API 단가 기준 (100만 토큰당 입력 $0.075, 출력 $0.30)
    // 1토큰당 단가 = 입력 0.000000075달러, 출력 0.00000030달러
    const inputRate = 0.000000075;
    const outputRate = 0.00000030;
    const costUsd = (promptTokens * inputRate) + (completionTokens * outputRate);

    // 백그라운드 비동기 처리
    supabaseAdmin
      .from("ai_usage_logs")
      .insert({
        user_id: userId || null,
        model_name: modelName,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        cost_usd: parseFloat(costUsd.toFixed(6)),
        analysis_type: analysisType
      })
      .then(({ error }) => {
        if (error) {
          console.error("[AI Usage Tracker Error]:", error);
        }
      });
  } catch (err) {
    console.error("[AI Usage Tracker Unexpected Error]:", err);
  }
}
