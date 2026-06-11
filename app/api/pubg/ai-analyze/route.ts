import { NextResponse } from "next/server";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { withAuthGuard } from "@/utils/supabase/guard";
import { trackAiUsage } from "@/lib/pubg-analysis/aiUsageTracker";
import { AI_CACHE_VERSION } from "@/lib/pubg-analysis/constants";
import { normalizeName } from "@/lib/pubg-analysis/utils";

export async function POST(request: Request) {
  try {
    // 🔒 [보안] JWT 인증 가드 — 로그인된 사용자만 AI 분석 실행 허용 (Gemini API 비용 방어)
    const auth = await withAuthGuard();
    if (auth.error) return auth.error;
    const { supabaseAdmin: supabase } = auth;

    const body = await request.json();
    const { matchData, nickname, platform = "steam", coachingStyle = "spicy" } = body;
    const isMild = coachingStyle === "mild";

    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No API Key" }, { status: 500 });
    if (!matchData || !nickname) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const matchId = matchData.matchId || matchData.match_id || matchData.id;
    if (!matchId) return NextResponse.json({ error: "Missing matchId" }, { status: 400 });
    const playerId = normalizeName(nickname);
    const cachePlatform = String(platform || "steam").toLowerCase();

    // 1. DB Cache Lookup
    try {
      const { data: cached, error: cacheErr } = await supabase
        .from("match_ai_coaching_cache")
        .select("ai_result")
        .eq("match_id", matchId)
        .eq("platform", cachePlatform)
        .eq("player_id", playerId)
        .eq("coaching_style", coachingStyle)
        .eq("prompt_version", AI_CACHE_VERSION)
        .maybeSingle();

      if (!cacheErr && cached && cached.ai_result) {
        const cachedData = cached.ai_result as any;
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk", data: cachedData.text }) + "\n"));
            controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
            controller.close();
          }
        });
        return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } });
      }
    } catch (dbErr) {
      console.warn("[AI-ANALYZE] Cache lookup failed:", dbErr);
    }

    const { 
      stats, mapName, gameMode, 
      eliteBenchmark = {},
      killContribution = { solo: 0, cleanup: 0, other: 0 },
      tradeStats = {}, combatPressure = {},
      isolationData = null,
      teamImpact = { damageImpact: 0, killImpact: 0, teamDamageShare: 0, teamKillShare: 0 } as any,
      badges = []
    } = matchData;
    const leadKills = stats?.leadShotKills ?? matchData.leadShotKills ?? 0;
    const leadKnocks = stats?.leadShotKnocks ?? matchData.leadShotKnocks ?? 0;
    const ridingKills = stats?.ridingShotKills ?? matchData.ridingShotKills ?? 0;
    const ridingKnocks = stats?.ridingShotKnocks ?? matchData.ridingShotKnocks ?? 0;
    const hasVehicleCombat = leadKills > 0 || leadKnocks > 0 || ridingKills > 0 || ridingKnocks > 0;

    const playerReportSummary = `
[기본 성적]
- 매치: ${mapName} (${gameMode}), 순위: #${stats.winPlace}
- 전투: ${stats.kills}킬 / ${stats.assists}어시 / ${stats.DBNOs}기절 / 유효 딜량 ${Math.floor(stats.processedDamageDealt ?? stats.damageDealt)}${hasVehicleCombat ? `\n- 특수 전투(차량): 리드샷 기절/킬 ${leadKnocks}/${leadKills}, 라이딩샷 기절/킬 ${ridingKnocks}/${ridingKills}` : ""}
- 킬 기여도: 직접 사살(Solo Kill) ${killContribution.solo}회 / 마무리 사살(Cleanup) ${killContribution.cleanup}회
- 실력 등급: 엘리트 대비 딜량 ${teamImpact.damageImpact}% / 킬 ${teamImpact.killImpact}% 
- 팀 기여도: 팀 내 딜량 비중 ${teamImpact.teamDamageShare}% / 팀 내 킬 비중 ${teamImpact.teamKillShare}%
- 획득 배지: ${badges.length > 0 ? badges.map((b: any) => `[${b.name}: ${b.desc}]`).join(", ") : "없음"}
- 생존: ${Math.floor(stats.timeSurvived / 60)}분 ${stats.timeSurvived % 60}초

[전술 지표 (유저 vs DB 티어 평균)]
- 1:1 교전 승률: ${matchData.duelStats?.duelWinRate || 0}% (Elite Avg: ${eliteBenchmark.avgDuelWinRate || 55}%)
- 복수(Trade) 성공률: ${tradeStats.tradeRate || 0}% (Elite Avg: ${eliteBenchmark.avgTradeRate || 50}%)
- 선제 공격 성공률: ${matchData.initiative_rate || 0}% (Elite Avg: ${eliteBenchmark.avgInitiativeRate || 55}%)
- 대응 사격 속도(반응): ${tradeStats.reactionLatencyMs > 0 ? (tradeStats.reactionLatencyMs/1000).toFixed(2) : "데이터 부족"}s (Elite Avg: ${eliteBenchmark.avgCounterLatency !== undefined ? eliteBenchmark.avgCounterLatency : 0.5}s)
- 백업(Trade) 속도: ${tradeStats.tradeLatencyMs > 0 ? (tradeStats.tradeLatencyMs/1000).toFixed(1) : "데이터 부족"}s (Elite Avg: ${eliteBenchmark.avgTradeLatency !== undefined ? eliteBenchmark.avgTradeLatency : 12.0}s)
- 전술 지원: 견제사격 ${tradeStats.suppCount || 0}회 (Elite Avg: ${eliteBenchmark.avgSuppCount || 3.0}회)
- 위기 관리: 소생률 ${tradeStats.teammateKnocks > 0 ? Math.round((tradeStats.revCount / tradeStats.teammateKnocks) * 100) : 0}% (Elite Avg: ${eliteBenchmark.avgReviveRate || 80}%) / 연막 엄호율 ${tradeStats.teammateKnocks > 0 ? Math.round((tradeStats.smokeCount / tradeStats.teammateKnocks) * 100) : 0}% (Elite Avg: ${eliteBenchmark.avgSmokeRate || 60}%)
- 공간 전술: 고립 지수 ${isolationData?.isolationIndex || "데이터 부족"} (Elite Avg: ${eliteBenchmark.avgIsolationIndex || 1.0}) / 아군 평균 거리: ${isolationData?.minDist || 0}m / 고도차 ${isolationData?.heightDiff || 0}m / 십자포화 노출: ${isolationData?.isCrossfire ? "있음" : "없음"}
- 유틸리티 정밀: 총 투척 ${combatPressure.utilityStats?.throwCount || 0}회 / 정확도 ${combatPressure.utilityStats?.accuracy || 0}% / 개당 평균 딜 ${combatPressure.utilityStats?.avgDamagePerThrow || 0}
- 교전 압박: 압박 지수 ${combatPressure.pressureIndex || 0} (Elite Avg: ${eliteBenchmark.avgPressureIndex || 3.0}) / 투척물 딜량 ${combatPressure.utilityDamage || 0}
- 운영 패턴: 사망 페이즈 ${matchData.deathPhase || 0} (Elite Avg: ${eliteBenchmark.avgDeathPhase || 6} 페이즈)
- 팀 전멸 기여: ${tradeStats.enemyTeamWipes || 0}회
`.trim();

    const personaPrompt = isMild 
      ? `당신은 '다정한 코치'입니다. 유저의 플레이에서 전술적 가치를 찾아 따뜻하게 조언하십시오. 
         단, 상위권 지표와 큰 격차가 나는 수치(예: 너무 짧은 교전 거리, 낮은 주도권)를 무리하게 칭찬(억지 미화)하지 마십시오. 
         수치가 부족하다면 '이타적 희생'보다는 '성장 가능성이 필요한 부분'으로 정직하게 언급하되, 부드러운 말투로 격려하십시오.`
      : `당신은 '매운맛 분석가'입니다. 팩트 중심의 냉혹한 실전 분석가입니다. 
         획득한 배지가 있더라도 전술적 지표(고립, 대응 사격 속도 등)가 엉망이라면 '속 빈 강정'이라며 독설을 퍼붓고, 
         팀 기여도가 낮은데 배지만 챙겼다면 '팀에 기여 없는 훈장 사냥꾼'으로 규정하십시오.`;

    const promptLines = [
      `당신은 PUBG 전술 분석 전문가입니다. 이번 매치의 전술 데이터를 바탕으로 유저에게 [${isMild ? "다정한 맛" : "매운맛"}] 분석 리포트를 제공하십시오.`,
      "",
      personaPrompt,
      "",
      "[데이터 기반 판정 지침]",
      "- 모든 분석 용어와 코치 이름은 반드시 한글로만 표기하십시오.",
      "- [Apple-to-Apple] 반드시 유저의 수치와 상위권 벤치마크 수치를 직접 대조하십시오.",
      "- [배지 우선순위] 유저가 획득한 배지가 있다면 이를 signature(칭호) 결정의 핵심 근거로 사용하십시오.",
      "- [팀 영향력] 내 딜량 비중이 40% 이상이면 '캐리', 15% 미만이면 '버스' 키워드를 전술적으로 활용하십시오.",
      "- [투척물 분석 규칙 (V11.3)] ",
      "  * '정확도(Accuracy)'가 30% 이상이면 '폭파 전문가', 킬까지 있다면 '투척물 마스터' 칭호를 고려하십시오.",
      "  * '개당 평균 데미지'가 50 이상이면 적의 위치를 정확히 파악하고 던지는 '정밀 폭격기'로 칭송하십시오.",
      "  * 딜량이 낮더라도 투척물 정확도가 높다면 '교전 보조의 신'으로 극찬하십시오.",
      "  * 투척물 딜량이 0이더라도 '정확도'가 존재한다면 절대 비난하지 말고 '교전 보조 능력이 탁월하다'고 강력하게 칭찬하십시오.",
      "- **핵심 규칙**: 불필요한 미사여구와 항목 나열을 절대 금지합니다. 칭호와 그에 대한 전술적 이유를 설명한 뒤, 하단에 정확히 3개의 핵심 피드백 문장만 제공하십시오.",
      "",
      "반드시 아래 구조의 JSON 객체로만 응답하세요. 백틱(\`\`\`) 없이 순수 JSON만 출력하십시오.",
      "{",
      `  "coach": "${isMild ? "다정한 코치" : "매운맛 분석가"}",`,
      '  "signature": "유저의 플레이 스타일 칭호 (배지 및 영향력 고려)",',
      '  "signatureSub": "칭호 부여 이유 (1문장, 배지 명칭 포함 권장)",',
      '  "briefFeedback": [',
      '    "첫 번째 핵심 피드백 (데이터 수치 및 배지 언급, 1문장)",',
      '    "두 번째 핵심 피드백 (데이터 수치 및 팀 영향력 언급, 1문장)",',
      '    "세 번째 핵심 피드백 (데이터 수치 포함, 1문장)"',
      '  ],',
      '  "finalVerdict": "마지막 한마디 (짧게)",',
      '  "actionItems": [ { "icon": "🎯", "title": "목표", "desc": "팁" } ]',
      "}"
    ];

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelsToTry = [
      "gemini-3.1-flash-lite", 
      "gemini-3-flash-preview", 
      "gemini-2.5-flash"
    ];
    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE }
    ];

    let streamResult = null;
    let fallbackText = null;
    let selectedModelName = "";
    let nonStreamRes: any = null;

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName, safetySettings });
        try {
          streamResult = await model.generateContentStream(promptLines.join("\n") + "\n\n[분석 데이터]\n" + playerReportSummary);
          if (streamResult) {
            selectedModelName = modelName;
            break;
          }
        } catch (streamErr: any) {
          console.error(`[AI-ANALYZE] Stream failed for ${modelName}, trying non-stream fallback:`, streamErr.message || streamErr);
          nonStreamRes = await model.generateContent(promptLines.join("\n") + "\n\n[분석 데이터]\n" + playerReportSummary);
          fallbackText = nonStreamRes.response.text();
          if (fallbackText) {
            selectedModelName = modelName;
            break;
          }
        }
      } catch (err: any) { 
        console.error(`[AI-ANALYZE] Model ${modelName} initialization failed:`, err.message || err);
        continue; 
      }
    }

    if (!streamResult && !fallbackText) throw new Error("모든 AI 모델이 응답에 실패했습니다.");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let aiResponseText = "";
          if (streamResult) {
            for await (const chunk of streamResult.stream) {
              if (request.signal.aborted) {
                break;
              }
              const chunkText = chunk.text();
              aiResponseText += chunkText;
              controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk", data: chunkText }) + "\n")); 
            }

            // 비동기로 사용량 메타데이터 획득 후 로깅
            streamResult.response.then((res: any) => {
              if (res.usageMetadata) {
                trackAiUsage(
                  auth.user?.id,
                  selectedModelName,
                  res.usageMetadata.promptTokenCount,
                  res.usageMetadata.candidatesTokenCount,
                  "analyze"
                );
              }
            }).catch((err: any) => console.error("[AI-ANALYZE] Usage fetch error:", err));

          } else if (fallbackText) { 
            aiResponseText = fallbackText;
            controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk", data: fallbackText }) + "\n")); 
            
            if (nonStreamRes?.response?.usageMetadata) {
              trackAiUsage(
                auth.user?.id,
                selectedModelName,
                nonStreamRes.response.usageMetadata.promptTokenCount,
                nonStreamRes.response.usageMetadata.candidatesTokenCount,
                "analyze"
              );
            }
          }

          // 3. Write to DB Cache
          if (aiResponseText) {
            try {
              const { error: saveErr } = await supabase
                .from("match_ai_coaching_cache")
                .upsert({
                  match_id: matchId,
                  platform: cachePlatform,
                  player_id: playerId,
                  coaching_style: coachingStyle,
                  prompt_version: AI_CACHE_VERSION,
                  ai_result: { text: aiResponseText },
                  updated_at: new Date().toISOString()
                }, { onConflict: "match_id,platform,player_id,coaching_style,prompt_version" });
              if (saveErr) throw saveErr;
            } catch (saveErr: any) {
              console.warn("[AI-ANALYZE] Failed to write cache to DB:", saveErr.message || saveErr);
            }
          }

          controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
        } catch (e) { controller.error(e); } finally { controller.close(); }
      }
    });

    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
