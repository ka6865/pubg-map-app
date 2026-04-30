import { NextResponse } from "next/server";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { matchData, nickname, coachingStyle = "spicy" } = body;
    const isMild = coachingStyle === "mild";

    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No API Key" }, { status: 500 });
    if (!matchData || !nickname) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const { 
      stats, mapName, gameMode, 
      eliteBenchmark = {}, initiativeStats = {}, deathDistance = 30,
      killContribution = { solo: 0, cleanup: 0, other: 0 },
      tradeStats = {}, combatPressure = {},
      isolationData = null,
      teamImpact = { damageImpact: 0, killImpact: 0 },
      badges = []
    } = matchData;

    const playerReportSummary = `
[기본 성적]
- 매치: ${mapName} (${gameMode}), 순위: #${stats.winPlace}
- 전투: ${stats.kills}킬 / ${stats.assists}어시 / ${stats.DBNOs}기절 / 딜량 ${Math.floor(stats.damageDealt)}
- 킬 기여도: 직접 사살(Solo Kill) ${killContribution.solo}회 / 마무리 사살(Cleanup) ${killContribution.cleanup}회
- 팀 기여: 내 딜량 비중 ${teamImpact.damageImpact}% / 내 킬 비중 ${teamImpact.killImpact}%
- 획득 배지: ${badges.length > 0 ? badges.map((b: any) => `[${b.name}: ${b.desc}]`).join(", ") : "없음"}
- 생존: ${Math.floor(stats.timeSurvived / 60)}분 ${stats.timeSurvived % 60}초

[전술 지표]
- 선제 공격: 시도 ${initiativeStats.total || 0}회, 성공률 ${matchData.initiative_rate || initiativeStats.rate || 0}% (Elite: ${eliteBenchmark.realInitiativeSuccess}%)
- 전술 지원: 견제사격 ${tradeStats.suppCount || 0}회, 연막세이브 ${tradeStats.smokeCount || 0}회, 직접부활 ${tradeStats.revCount || 0}회
- 대응 사격: 내 대응 사격 속도 ${tradeStats.counterLatencyMs > 0 ? (tradeStats.counterLatencyMs/1000).toFixed(2) : "데이터 부족"}s (Elite: ${(eliteBenchmark.realTradeLatency/1000).toFixed(2)}s)
- 교전 거리: 사망 시 적과의 거리 ${deathDistance}m (Elite: ${eliteBenchmark.realDeathDistance}m)
- 공간 전술: 고립 지수 ${isolationData?.isolationIndex || "데이터 부족"} / 고도차 ${isolationData?.heightDiff || 0}m / 포위(교차사격) 노출 ${isolationData?.isCrossfire ? "있음" : "없음"}
- 화력 압박: 총 ${combatPressure.totalHits || 0}회 적중 / 압박 지수 ${combatPressure.pressureIndex || 0} / 투척물 딜량 ${combatPressure.utilityDamage || 0}
`.trim();

    const personaPrompt = isMild 
      ? `당신은 '다정한 코치'입니다. 유저의 플레이에서 숨겨진 '이타적 헌신'과 획득한 전술 배지의 가치를 찾아 칭찬하십시오. 
         팀 내 영향력이 높다면 '팀을 승리로 이끈 일등공신'으로, 낮더라도 '팀워크를 위한 희생'으로 해석하여 격려하세요.`
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
      "- **핵심 규칙**: 불필요한 카드나 항목 나열을 절대 금지합니다. 칭호와 그에 대한 전술적 이유를 설명한 뒤, 하단에 정확히 3개의 핵심 피드백 문장만 제공하십시오.",
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
    const modelsToTry = ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-2.5-flash"];
    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE }
    ];

    let streamResult = null;
    let fallbackText = null;

    for (const modelName of modelsToTry) {
      try {
        // console.log(`[AI-ANALYZE] Attempting model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName, safetySettings });
        try {
          streamResult = await model.generateContentStream(promptLines.join("\n") + "\n\n[분석 데이터]\n" + playerReportSummary);
          if (streamResult) {
            // console.log(`[AI-ANALYZE] Successfully initiated stream with ${modelName}`);
            break;
          }
        } catch (streamErr: any) {
          console.error(`[AI-ANALYZE] Stream failed for ${modelName}, trying non-stream fallback:`, streamErr.message || streamErr);
          const nonStreamRes = await model.generateContent(promptLines.join("\n") + "\n\n[분석 데이터]\n" + playerReportSummary);
          fallbackText = nonStreamRes.response.text();
          if (fallbackText) break;
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
          if (streamResult) {
            for await (const chunk of streamResult.stream) { controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk", data: chunk.text() }) + "\n")); }
          } else if (fallbackText) { controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk", data: fallbackText }) + "\n")); }
          controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
        } catch (e) { controller.error(e); } finally { controller.close(); }
      }
    });

    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
