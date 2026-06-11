import { NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { jsonrepair } from "jsonrepair";
import { withAuthGuard } from "@/utils/supabase/guard";
import { trackAiUsage } from "@/lib/pubg-analysis/aiUsageTracker";
import { AI_CACHE_VERSION } from "@/lib/pubg-analysis/constants";
import { normalizeName } from "@/lib/pubg-analysis/utils";
import { normalizePlatform } from "@/lib/pubg-analysis/cacheIdentity";
import crypto from "crypto";
import { getSquadAnalysisData } from "@/lib/pubg-analysis/squadAnalysis";

function extractValidJson(text: string): string {
  try {
    const cleaned = text.trim().replace(/```json|```/g, "").trim();
    const firstBrace = cleaned.indexOf('{');
    if (firstBrace === -1) return cleaned;
    const target = cleaned.substring(firstBrace);
    return jsonrepair(target);
  } catch (err) {
    console.warn("[AI-SQUAD] jsonrepair failed, falling back to manual extraction", err);
    const firstBrace = text.indexOf('{');
    if (firstBrace === -1) return text;
    let braceCount = 0;
    let inString = false;
    for (let i = firstBrace; i < text.length; i++) {
      const char = text[i];
      if (char === '"' && (i === 0 || text[i - 1] !== '\\')) {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (braceCount === 0) return text.substring(firstBrace, i + 1);
      }
    }
    return text;
  }
}

function hashParts(parts: unknown[]): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex");
}

const AI_SQUAD_TOTAL_TIMEOUT_MS = 22000;
const AI_SQUAD_MODEL_TIMEOUT_MS = 8000;

export async function POST(request: Request) {
  let body: any = {};
  try {
    // 🔒 [Security] JWT Authentication Guard - Only logged-in users can call AI coaching
    const auth = await withAuthGuard();
    if (auth.error) return auth.error;
    const { supabaseAdmin: supabase } = auth;

    body = await request.json();
    const { groupKey, stats, scores, roleProfiles, nickname, platform = "steam", coachingStyle = "spicy", squadGrade = "B", benchmarkStats } = body;
    const isMild = coachingStyle === "mild";
    const playerId = normalizeName(nickname);
    const cachePlatform = normalizePlatform(platform);

    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing Gemini API Key Configuration" }, { status: 500 });
    }

    if (!groupKey || !stats || !scores || !Array.isArray(roleProfiles) || !nickname) {
      return NextResponse.json({ error: "Missing required squad parameters" }, { status: 400 });
    }

    // 1. Calculate matchIdsHash based on the current squad matches in DB
    const requestMatchIds = Array.isArray(body.matchIds) ? body.matchIds.filter(Boolean) : [];
    const roleProfileNames = Array.isArray(roleProfiles)
      ? roleProfiles.map((p: any) => p?.name).filter(Boolean).sort()
      : [];
    let matchIdsHash = requestMatchIds.length > 0
      ? hashParts(["matches", requestMatchIds.map(String).sort()])
      : hashParts(["body", playerId, cachePlatform, groupKey, body.matchCount || 1, stats, scores, roleProfileNames]);
    try {
      const squadData = await getSquadAnalysisData(nickname, cachePlatform, groupKey);
      if (squadData && "matchesSummary" in squadData && Array.isArray(squadData.matchesSummary)) {
        const matchIds = squadData.matchesSummary.map((m: any) => m.matchId || m.match_id).filter(Boolean);
        if (matchIds.length > 0) {
          matchIdsHash = hashParts(["matches", matchIds.map(String).sort()]);
        }
      }
    } catch (hashErr) {
      console.warn("[AI-SQUAD] Failed to compute DB matchIdsHash, using request hash:", hashErr);
    }

    // 2. Perform DB Cache Lookup
    try {
      const { data: cached, error: cacheErr } = await supabase
        .from("squad_ai_coaching_cache")
        .select("ai_result")
        .eq("player_id", playerId)
        .eq("platform", cachePlatform)
        .eq("group_key", groupKey)
        .eq("match_ids_hash", matchIdsHash)
        .eq("coaching_style", coachingStyle)
        .eq("prompt_version", AI_CACHE_VERSION)
        .maybeSingle();

      if (!cacheErr && cached && cached.ai_result) {
        return NextResponse.json(cached.ai_result);
      }
    } catch (dbErr) {
      console.warn("[AI-SQUAD] Cache lookup failed:", dbErr);
    }

    const matchCount = body.matchCount || 1;
    const myTradeLatencySec = stats.avgTradeLatency > 0 ? (stats.avgTradeLatency / 1000).toFixed(2) : "0.0";
    const benchmarkTradeLatencySec = benchmarkStats?.avgTradeLatency ? (benchmarkStats.avgTradeLatency / 1000).toFixed(2) : "0.0";
    const coverRatePercent = Math.round(stats.avgCoverRate * 100);

    // 1. Serialize members performance data for prompt context
    const membersReport = roleProfiles.map((p: any) => {
      return `- Nickname: ${p.name}
  * Tactical Role: ${p.role} (${p.roleDesc})
  * Avg Match Stats: ${p.avgDamage} Damage / ${p.avgKills} Kills / ${p.avgAssists} Assists / ${p.avgDbnos} Knockouts
  * Team Contribution Shares: Damage ${p.shares.damage}%, Kills ${p.shares.kill}%, Assists ${p.shares.assist}%, Knockouts ${p.shares.dbno}%
      `.trim();
    }).join("\n\n");

    const benchmarkContext = benchmarkStats ? `
[Global Benchmark Context (Tier: ${benchmarkStats.tier})]
- Global Avg Isolation Index (대열 이탈 고립도): ${benchmarkStats.avgIsolation} (Our Squad Avg: ${stats.avgIsolation})
- Global Avg Backup Speed (백업 반응 속도): ${benchmarkTradeLatencySec}초 (Our Squad Avg: ${myTradeLatencySec}초)
- Global Avg Revive Success Rate (부활 성공률): ${benchmarkStats.avgReviveRate}%
- Global Avg Smoke Rescue Rate (연막탄 구출 성공률): ${benchmarkStats.avgSmokeRate}%
- Global Avg Squad Team Wipes (경기당 적 전멸 기여): ${benchmarkStats.avgTeamWipes}회 (Our Squad Avg: ${(stats.totalTeamWipes / matchCount).toFixed(2)}회)

[Assigned Fixed Squad Grade]
- Given Grade: ${squadGrade} (You must strictly output this exact grade in the "squadGrade" JSON field. Do NOT change it.)
` : `
[Assigned Fixed Squad Grade]
- Given Grade: ${squadGrade} (You must strictly output this exact grade in the "squadGrade" JSON field. Do NOT change it.)
`;
    const squadReportSummary = `
[Squad Teammates]
- Target Player: ${nickname}
- Teammates: ${groupKey}
- Match Count Together: ${matchCount} matches

[Individual Member Role & Stats]
${membersReport}

[Squad Collaboration Performance Average]
- Average Isolation Index (대열 이탈 고립도): ${stats.avgIsolation} (낮을수록 좋음. 1.0은 대열 유지 우수, 3.5 이상은 높은 고립 데스 위험)
- Backup Speed (아군 기절 후 백업 속도): ${myTradeLatencySec}초 (평균적으로 아군이 누운 뒤 복수 킬을 내는 데 걸린 시간)
- Smoke Rescues (연막 구출 세이브 성공 수): ${stats.totalSmokeRescues}회 (단순히 연막탄을 던진 횟수가 아니라, 기절한 팀원 주변에 연막을 쳐서 안전을 도모하고 소생까지 성공적으로 완료한 '연막 세이브' 횟수)
- Ally Revives (아군 부활 성공 수): ${stats.totalRevives}회
- Average Cover Rate (평균 아군 집중사격 커버율): ${coverRatePercent}% (동시 교전 참여 지표)
- Enemy Squad Team Wipes (적 스쿼드 전멸 유발 수): ${stats.totalTeamWipes}회
${benchmarkContext}

[Synergy Balance Scores (Scale 10 - 100)]
- Formation & Cohesion (대열 유지): ${scores.formation}
- Backup Trade Speed (백업 속도): ${scores.backupSpeed}
- Survival Care & Rescue (생존 케어): ${scores.survivalCare}
- Focus Fire Co-op (화력 집중): ${scores.focusFire}
- Team Decisive Wipe (전멸 기여): ${scores.teamWipe}
    `.trim();

    // 2. Select AI persona based on coachingStyle
    let systemInstruction = "";
    if (isMild) {
      systemInstruction = `
You are "KIND COACH", a warm, encouraging, and tactical PUBG coach.
Analyze the provided squad synergy report and write a report.
- Focus on positive collaboration indices first.
- Defend teammates' mistakes by explaining situational context.
- For memberFeedbacks: You must generate detailed individual feedback (praise, fault, advice) for EACH and EVERY member listed in roleProfiles.
- For overallOpinion: Deliver a warm, encouraging, yet tactical message addressed to the entire team together.
- Output MUST be structured in JSON matching the exact schema.
- Language: Output fields MUST be written in Korean.
- CRITICAL: You MUST use the exact GIVEN squadGrade ("${squadGrade}") in the "squadGrade" output property. Do NOT change or recalculate the grade yourself.
      `.trim();
    } else {
      systemInstruction = `
You are "SPICY BOMBER", a brutal, fact-based, and highly sarcastic PUBG tactical analyst.
Analyze the provided squad synergy report and write a detailed roast and analysis.

[Rules for roasting & tone]:
1. NEVER use explicit vulgar swear words (e.g. "병신", "개새끼", "시발") directly, to prevent safety filters from blocking the response.
2. Maximize mental damage using PUBG community terms and sarcastic metaphors:
   - "킬로그 배달부" (Killfeed delivery), "걸어다니는 파밍 상자/보급 상자" (Walking lootbox)
   - "뇌 빼고 배그함?" (Brainless play), "손가락 압수 마렵다" (Confiscating fingers)
   - "에임 실화냐?" (Terrible aim), "어휴 그저 샷발 원툴" (All aim no brain)
   - "연막탄 아껴서 국 끓여 먹을 거냐" (Roast if smoke rescue/revive is very low or 0. Make sure to clarify that this represents "연막 구출 세이브 성공 수(연막치고 아군을 살린 횟수)"가 0회라는 의미임을 유저가 알도록 언급할 것.)
   - "혼자 정글북 찍으며 각개전투함" (Roast if isolation index is high, e.g. > 3.0)
3. Highlight metrics aggressively using clear, human-readable units (e.g. "X.X초", "X회", "X%"):
   - NEVER output raw millisecond values like "22958ms" or "12000ms" in the response. Always divide by 1000 and round to convert them to seconds like "23.0초" or "12.0초".
   - If trade latency is slow: "아군 기절하고 장례식 다 치른 뒤에야 늦장 백업 오실 겁니까? 평균 대비 너무 느립니다."
   - If isolation rate is high: "4인 스쿼드를 하는 게 아니라 1인 솔로 4개를 돌리는 오합지졸 상태입니다."
4. Deliver extremely sharp, critical, yet constructive, fact-based overall opinion and feedback.
5. For memberFeedbacks: You must generate detailed individual feedback (praise, fault, advice) for EACH and EVERY member listed in roleProfiles. Don't be soft. Roast them based on their relative stat shares (e.g. high kill share but zero assist/revive).
6. For overallOpinion: Deliver a sharp, critical, yet highly constructive message addressed to the entire team together.
7. Output MUST be structured in JSON matching the exact schema.
8. Language: Output fields MUST be written in Korean.
9. CRITICAL: You MUST use the exact GIVEN squadGrade ("${squadGrade}") in the "squadGrade" output property. Do NOT change or recalculate the grade yourself.
      `.trim();
    }

    // 3. Try multiple Gemini models sequentially
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelsToTry = [
      "gemini-3.1-flash-lite",
      "gemini-3-flash-preview",
      "gemini-2.5-flash"
    ];

    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
    ];

    const prompt = `
${squadReportSummary}

Based on the above performance data, write a tactical coaching report according to your designated persona.
Make sure to reference the GIVEN squadGrade "${squadGrade}" and the compared benchmark statistics to provide concrete, quantitative facts (e.g. "평균 대비 X초 빠름") in your feedback.
    `.trim();

    let responseText = "";
    let selectedModelName = "";
    let usageMetadata: any = null;

    const generationStartedAt = Date.now();
    for (const modelName of modelsToTry) {
      try {
        const remainingMs = AI_SQUAD_TOTAL_TIMEOUT_MS - (Date.now() - generationStartedAt);
        if (remainingMs <= 0) break;

        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemInstruction,
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: SchemaType.OBJECT,
              properties: {
                squadGrade: { type: SchemaType.STRING, description: `Must be exactly "${squadGrade}" (GIVEN overall grade)` },
                summary: { type: SchemaType.STRING, description: "One-line tactical summary of this squad" },
                strength: { type: SchemaType.STRING, description: "Key strength of squad collaboration" },
                weakness: { type: SchemaType.STRING, description: "Major vulnerability/weakness of the squad" },
                coaching: { type: SchemaType.STRING, description: "Practical coaching advice to improve squad synergy" },
                memberFeedbacks: {
                  type: SchemaType.ARRAY,
                  description: "Individual tactical feedback for each and every squad member in roleProfiles",
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      name: { type: SchemaType.STRING, description: "Nickname of the squad member" },
                      praise: { type: SchemaType.STRING, description: "Detailed positive actions, strengths or what they did well (칭찬할 점)" },
                      fault: { type: SchemaType.STRING, description: "Detailed vulnerabilities, mistakes, or what they did poorly (못한 점)" },
                      advice: { type: SchemaType.STRING, description: "Detailed improvement points and tactical advice (피드백)" }
                    },
                    required: ["name", "praise", "fault", "advice"]
                  }
                },
                overallOpinion: { type: SchemaType.STRING, description: "Overall coaching review and warning/encouragement addressed to the entire team (팀원 모두에게 한마디씩 총평)" }
              },
              required: ["squadGrade", "summary", "strength", "weakness", "coaching", "memberFeedbacks", "overallOpinion"]
            }
          },
          safetySettings
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), Math.min(AI_SQUAD_MODEL_TIMEOUT_MS, remainingMs))
        );

        const response = await Promise.race([
          model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }]
          }),
          timeoutPromise
        ]) as any;

        if (response && response.response) {
          responseText = response.response.text();
          selectedModelName = modelName;
          usageMetadata = response.response.usageMetadata;
          break;
        }
      } catch (err: any) {
        console.warn(`[AI-SQUAD] Model ${modelName} failed (${err.message || err}), trying next...`);
      }
    }

    if (!responseText) {
      throw new Error("All Gemini models failed to respond or timed out.");
    }

    const validJsonString = extractValidJson(responseText);
    const resultJson = JSON.parse(validJsonString);

    // 3. Write to DB Cache
    try {
      const { error: saveErr } = await supabase
        .from("squad_ai_coaching_cache")
        .upsert({
          player_id: playerId,
          platform: cachePlatform,
          group_key: groupKey,
          match_ids_hash: matchIdsHash,
          coaching_style: coachingStyle,
          prompt_version: AI_CACHE_VERSION,
          ai_result: resultJson,
          updated_at: new Date().toISOString()
        }, { onConflict: "player_id,platform,group_key,match_ids_hash,coaching_style,prompt_version" });
      if (saveErr) throw saveErr;
    } catch (saveErr: any) {
      console.warn("[AI-SQUAD] Failed to write cache to DB:", saveErr.message || saveErr);
    }

    // Track usage stats
    if (selectedModelName && usageMetadata) {
      try {
        const promptTokens = usageMetadata.promptTokenCount || 0;
        const completionTokens = usageMetadata.candidatesTokenCount || 0;

        trackAiUsage(
          auth.user.id,
          selectedModelName,
          promptTokens,
          completionTokens,
          "squad"
        );
      } catch (e) {
        console.warn("AI Usage tracking failed:", e);
      }
    }

    return NextResponse.json(resultJson);

  } catch (error) {
    console.error("[AI-SQUAD-ERROR]", error);
    
    // Safety fallback data in case of API failure - bifurcated based on coachingStyle
    const isMild = body.coachingStyle === "mild";
    const roleProfilesFallback = Array.isArray(body.roleProfiles) ? body.roleProfiles : [];
    const fallbackGrade = body.squadGrade || "B";

    const fallbackData = isMild
      ? {
          squadGrade: fallbackGrade,
          summary: "서로의 부족함을 든든하게 메워주는 따뜻한 연대의 스쿼드",
          strength: "동료가 위기에 처했을 때 빠르게 연막탄을 던져 구출하고 소생시키는 끈끈한 케어 능력이 최고입니다.",
          weakness: "동료를 돕기 위해 무리하게 진입하다가 함께 위기에 빠지는 착한 고립 지수가 약간 보입니다.",
          coaching: "서로를 지키는 마음은 훌륭하니, 진입 전 시야 확보를 위해 먼저 백업 커버 포지션을 지정하고 천천히 진입해보세요.",
          memberFeedbacks: roleProfilesFallback.map((p: any) => ({
            name: p.name,
            praise: "팀원들과 항상 동선을 맞추려 노력하고 교전 지원 의지가 돋보임",
            fault: "팀원이 기절했을 때 엄폐 연막 없이 무리하게 소생하려다 함께 위험에 처할 수 있음",
            advice: "소생 전 반드시 연막탄을 넓게 전개하고 안전 각도를 먼저 확보해 주길 바람"
          })),
          overallOpinion: "서로를 구하고 챙겨주려는 마음만큼은 훌륭합니다! 조금만 더 전술적인 침착함을 보완해 안전한 구출 루트를 설계한다면 훨씬 탄탄한 스쿼드가 될 것입니다."
        }
      : {
          squadGrade: fallbackGrade,
          summary: "정교한 오더와 백업 부재로 따로 놀다 전멸하는 오합지졸 스쿼드",
          strength: "각자도생하는 피지컬은 나쁘지 않으나, 개인플레이에 의존하여 시너지가 전무합니다.",
          weakness: "아군이 물렸을 때 백업하는 속도가 너무 느리고, 엄폐 연막도 없이 무지성 소생을 시도해 더블 킬을 헌납합니다.",
          coaching: "구경만 하지 말고 고립 지수를 낮추기 위해 미니맵을 보며 대열을 맞추고, 백업 타이밍에 연막탄 투척 후 확실한 사각을 확보하세요.",
          memberFeedbacks: roleProfilesFallback.map((p: any) => ({
            name: p.name,
            praise: "일대일 교전 상황에서 자신의 공격력을 활용해 딜 기여를 해냄",
            fault: "팀의 포지션을 고려하지 않은 채 개인파밍이나 솔로 플레이로 인한 빈번한 고립",
            advice: "아군이 싸울 때 늦장 백업을 중단하고 교전 신호 즉시 시야 각을 같이 확인하고 지원할 것"
          })),
          overallOpinion: "개인 기량만으로는 스쿼드 전장 환경에서 살아남을 수 없습니다. 서로 대열 간격을 좁히고 백업 속도를 현재보다 최소 20% 이상 당겨주셔야 전멸을 막을 수 있습니다."
        };

    return NextResponse.json(fallbackData);
  }
}
