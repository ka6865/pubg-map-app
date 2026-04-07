import { NextResponse } from "next/server";

// [AI-SUMMARY] 이 파일은 groq-sdk 의존성을 제거하고 표준 fetch API를 사용하도록 수정되었습니다.
export async function POST(request: Request) {
  console.log("[AI-SUMMARY] 분석 요청 시작 (Standard Fetch Mode)");
  try {
    const { matchIds, nickname, platform } = await request.json();
    console.log(`[AI-SUMMARY] 대상: ${nickname} (${platform}), 매치수: ${matchIds?.length}`);

    if (!matchIds || matchIds.length === 0) {
      console.error("[AI-SUMMARY] 매치 ID가 없습니다.");
      return NextResponse.json({ error: "매치 데이터가 없습니다." }, { status: 400 });
    }

    const apiKey = (process.env.PUBG_API_KEY || "").split(" ")[0];
    const groqApiKey = process.env.GROQ_API_KEY;

    if (!groqApiKey) {
      console.error("[AI-SUMMARY] GROQ_API_KEY가 설정되지 않았습니다.");
      return NextResponse.json({ error: "Groq API 키가 설정되지 않았습니다." }, { status: 500 });
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/vnd.api+json",
    };

    // 1. 최대 10개의 매치 데이터를 순차적으로 수집 (Rate Limit 및 안정성 확보)
    const targetMatchIds = matchIds.slice(0, 10);
    console.log(`[AI-SUMMARY] 매치 데이터 수집 시작: ${targetMatchIds.length}건 (순차 처리 모드)`);
    
    const detailedMatches = [];
    for (const [index, id] of targetMatchIds.entries()) {
      try {
        console.log(`[AI-SUMMARY] (${index + 1}/${targetMatchIds.length}) 매치 ${id} 가져오는 중...`);
        
        const res = await fetch(`https://api.pubg.com/shards/${platform}/matches/${id}`, { 
          headers,
          signal: AbortSignal.timeout(20000) // 전역 타임아웃보다 짧게 개별 20초 설정
        });

        if (!res.ok) {
          console.warn(`[AI-SUMMARY] 매치 ${id} 수집 실패: ${res.status}`);
          continue;
        }

        const data = await res.json();
        const participant = data.included?.find(
          (inc: any) => inc.type === "participant" && inc.attributes.stats.name === nickname
        );
        
        if (!participant) {
          console.warn(`[AI-SUMMARY] 매치 ${id} 내 플레이어 ${nickname} 정보를 찾을 수 없음`);
          continue;
        }
        
        detailedMatches.push({
          mapName: {
            Erangel_Main: "에란겔",
            Desert_Main: "미라마",
            Tiger_Main: "태이고",
            Neon_Main: "론도",
            Savage_Main: "사녹",
            DihorOtok_Main: "비켄디",
            Chimera_Main: "데스턴",
            Kiki_Main: "데스턴",
          }[data.data.attributes.mapName as string] || data.data.attributes.mapName,
          stats: participant.attributes.stats,
          createdAt: data.data.attributes.createdAt,
        });

        // API 부하 방지를 위해 요청 사이에 아주 짧은 간격 추가
        if (index < targetMatchIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (err: any) {
        if (err.name === 'TimeoutError') {
          console.error(`[AI-SUMMARY] 매치 ${id} 요청 타임아웃 발생`);
        } else {
          console.error(`[AI-SUMMARY] 매치 ${id} 처리 중 예외 발생:`, err.message);
        }
        continue; // 다음 매치로 진행
      }
    }

    console.log(`[AI-SUMMARY] 상세 데이터 수집 완료: ${detailedMatches.length}건 성공`);

    if (detailedMatches.length === 0) {
      console.error("[AI-SUMMARY] 성공적으로 가져온 상세 매치 정보가 0건입니다.");
      return NextResponse.json({ error: "상세 매치 정보를 가져올 수 없습니다." }, { status: 404 });
    }

    // 2. 데이터 요약 및 트렌드 계산
    const summary = {
      totalKills: detailedMatches.reduce((acc, m) => acc + m.stats.kills, 0),
      totalDamage: detailedMatches.reduce((acc, m) => acc + m.stats.damageDealt, 0),
      avgWinPlace: detailedMatches.reduce((acc, m) => acc + m.stats.winPlace, 0) / detailedMatches.length,
      totalSurvived: detailedMatches.reduce((acc, m) => acc + m.stats.timeSurvived, 0),
      maps: Array.from(new Set(detailedMatches.map(m => m.mapName))),
    };

    console.log("[AI-SUMMARY] 데이터 요약 완료, AI 호출 준비");

    // 3. AI 프롬프트 생성 (Llama 3.3 70B 최적화)
    const systemPrompt = `당신은 전업 배틀그라운드 프로팀 코치입니다. 
플레이어의 최근 10경기 데이터를 기반으로 종합적인 리포트를 한국어로 작성하세요.

[분석 지침]
1. 10경기의 흐름(킬 추이, 순위 변동)을 파악하여 현재 '기세(Form)'를 진단하세요.
2. 특정 맵에서의 강점이나 약점을 짚어주세요.
3. 생존 시간 대비 딜량을 분석하여 '교전 효율성'을 평가하세요.
4. 마지막으로 실력을 한 단계 높이기 위한 '핵심 과제' 하나를 제시하세요.

[주의사항]
- 절대 영어, 한자, 프랑스어를 섞어 쓰지 마세요. 100% 한국어로만 답변하세요.
- PUBG 전문 용어(자기장 운영, 피킹, 푸쉬, 서클 헤드 등)를 적절히 섞어 신뢰감을 주되, 말투는 냉철하면서도 격려하는 조로 유지하세요.
- 마크다운 형식을 사용하여 가독성 있게 작성하세요.`;

    const userPrompt = `플레이어: ${nickname}
최근 ${detailedMatches.length}경기 요약:
${JSON.stringify(detailedMatches, null, 2)}

종합 통계:
- 총 킬: ${summary.totalKills} (평균 ${(summary.totalKills / detailedMatches.length).toFixed(1)})
- 총 딜량: ${Math.floor(summary.totalDamage)} (평균 ${Math.floor(summary.totalDamage / detailedMatches.length)})
- 평균 순위: ${summary.avgWinPlace.toFixed(1)}위
- 플레이한 맵: ${summary.maps.join(", ")}`;

    console.log("[AI-SUMMARY] Groq API 호출 시작");
    const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorBody = await aiResponse.text();
      console.error(`[AI-SUMMARY] Groq API 에러: ${aiResponse.status}`, errorBody);
      throw new Error(`Groq API Error: ${aiResponse.status}`);
    }

    const data = await aiResponse.json();
    const analysis = data.choices[0]?.message?.content || "분석 결과를 생성하지 못했습니다.";
    console.log("[AI-SUMMARY] AI 분석 완료");

    return NextResponse.json({ analysis });
  } catch (error: any) {
    console.error("[AI-SUMMARY] 치명적 에러 발생:", error);
    return NextResponse.json({ error: error.message || "종합 분석 중 오류가 발생했습니다." }, { status: 500 });
  }
}
