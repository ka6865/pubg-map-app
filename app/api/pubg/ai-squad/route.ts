import { NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { jsonrepair } from "jsonrepair";
import { withAuthGuard } from "@/utils/supabase/guard";
import { trackAiUsage } from "@/lib/pubg-analysis/aiUsageTracker";

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

export async function POST(request: Request) {
  try {
    // 🔒 [Security] JWT Authentication Guard - Only logged-in users can call AI coaching
    const auth = await withAuthGuard();
    if (auth.error) return auth.error;

    const body = await request.json();
    const { groupKey, stats, scores, roleProfiles, nickname, coachingStyle = "spicy", squadGrade = "B", benchmarkStats } = body;
    const isMild = coachingStyle === "mild";

    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing Gemini API Key Configuration" }, { status: 500 });
    }

    if (!groupKey || !stats || !scores || !roleProfiles) {
      return NextResponse.json({ error: "Missing required squad parameters" }, { status: 400 });
    }

    const matchCount = body.matchCount || 1;

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
- Global Avg Isolation Index: ${benchmarkStats.avgIsolation} (Our Squad Avg: ${stats.avgIsolation})
- Global Avg Backup Speed (Trade Latency): ${benchmarkStats.avgTradeLatency}ms (Our Squad Avg: ${stats.avgTradeLatency}ms)
- Global Avg Revive Success Rate: ${benchmarkStats.avgReviveRate}%
- Global Avg Smoke Rescue Rate: ${benchmarkStats.avgSmokeRate}%
- Global Avg Squad Team Wipes: ${benchmarkStats.avgTeamWipes} times (Our Squad Avg: ${(stats.totalTeamWipes / matchCount).toFixed(2)} times)

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
- Average Isolation Index: ${stats.avgIsolation} (Lower is better. 1.0 means tight group, >3.5 indicates high risk of isolated death)
- Backup Speed (Trade Latency): ${stats.avgTradeLatency}ms (Time taken to trade-kill after a teammate is knocked down)
- Smoke Rescues: ${stats.totalSmokeRescues} times
- Ally Revives: ${stats.totalRevives} times
- Average Cover Rate: ${stats.avgCoverRate} (Focus fire rate on common targets)
- Enemy Squad Team Wipes: ${stats.totalTeamWipes} times
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
You are "SPICY BOMBER", a brutal, fact-based, and aggressive PUBG tactical analyst.
Analyze the provided squad synergy report and write a report.
- Identify weak spots, slow backup speeds, high isolation rates, and lack of team-play.
- Give a very honest, harsh, yet highly practical advice.
- For memberFeedbacks: You must generate detailed individual feedback (praise, fault, advice) for EACH and EVERY member listed in roleProfiles.
- For overallOpinion: Deliver a sharp, critical, yet highly constructive message addressed to the entire team together.
- Output MUST be structured in JSON matching the exact schema.
- Language: Output fields MUST be written in Korean.
- CRITICAL: You MUST use the exact GIVEN squadGrade ("${squadGrade}") in the "squadGrade" output property. Do NOT change or recalculate the grade yourself.
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

    for (const modelName of modelsToTry) {
      try {
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

        // 20-second timeout
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 20000)
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
          console.log(`[AI-SQUAD] Successfully generated content using ${modelName}`);
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
          "analyze"
        );
      } catch (e) {
        console.warn("AI Usage tracking failed:", e);
      }
    }

    return NextResponse.json(resultJson);

  } catch (error) {
    console.error("[AI-SQUAD-ERROR]", error);
    
    // Safety fallback data in case of API failure - bifurcated based on coachingStyle
    let isMild = false;
    let roleProfilesFallback: any[] = [];
    let fallbackGrade = "B";
    try {
      const body = await request.clone().json().catch(() => ({}));
      isMild = body.coachingStyle === "mild";
      roleProfilesFallback = body.roleProfiles || [];
      fallbackGrade = body.squadGrade || "B";
    } catch (e) {
      // ignore
    }

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