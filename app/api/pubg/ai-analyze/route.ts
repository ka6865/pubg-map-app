import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { matchData, nickname, messages } = body;

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Groq API 키가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    if (!matchData || !nickname) {
      return NextResponse.json(
        { error: "분석할 데이터가 부족합니다." },
        { status: 400 }
      );
    }

    const { stats, mapName, gameMode, totalTeamKills } = matchData;

    // 심화 분석을 위한 보조 지표 계산
    const killParticipation = totalTeamKills > 0 ? Math.round((stats.kills / totalTeamKills) * 100) : 0;
    const damagePerKill = stats.kills > 0 ? Math.floor(stats.damageDealt / stats.kills) : Math.floor(stats.damageDealt);
    const mobilityStyle = stats.rideDistance > stats.walkDistance ? "차량 중심 장거리 운영" : "도보 중심 신중한 운영";

    const playerReportSummary = `
      현재 매치 요약:
      - 플레이어: ${nickname} (맵: ${mapName}, 모드: ${gameMode}, 순위: #${stats.winPlace})
      - 전투: ${stats.kills}킬 / ${stats.assists}어시 / ${stats.DBNOs}회 기절시킴 / 딜량 ${Math.floor(stats.damageDealt)}
      - 효율: 킬당 평균 ${damagePerKill}딜 / 팀 킬 기여도 ${killParticipation}%
      - 생존: ${Math.floor(stats.timeSurvived / 60)}분 ${stats.timeSurvived % 60}초 / 스타일: ${mobilityStyle}
      - 아이템: 회복 ${stats.heals}회 / 부스트 ${stats.boosts}회
    `;

    const systemPrompt = `
      너는 배틀그라운드 프로팀의 '수석 데이터 분석가'이자 유저의 성장을 돕는 코치야. 
      사용자가 제공하는 매치 데이터를 바탕으로 심도 있는 분석과 답변을 제공해줘.
      
      [필수 규칙]
      - 반드시 '100% 한국어(한글)'로만 답변해. 영어, 프랑스어, 한자 등 외국어는 절대 쓰지 마.
      - 배그 전문 용어를 자연스럽게 사용해 (예: 파밍, 자기장, 고춧가루, 존버, 짤파밍 등).
      - 사용자의 질문에 맞춰 매치 데이터를 유기적으로 해석해서 답변해줘.

      [데이터 배경]
      ${playerReportSummary}
    `;

    // 초기 분석 요청인 경우(messages가 없는 경우) 리포트 생성을 위한 초기 대화 구성
    const groqMessages = messages && messages.length > 0 
      ? [
          { role: "system", content: systemPrompt },
          ...messages
        ]
      : [
          { role: "system", content: systemPrompt },
          { role: "user", content: `이 매치 데이터를 바탕으로 심층 분석 리포트를 [매치 성격], [전투 디테일], [운영 디테일], [프로의 코딩] 형식에 맞춰 작성해줘.` }
        ];

    let analysis = "";
    try {
      console.log("Attempting analysis with Groq (Llama 3.3 70B)...");
      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile", // 최신 안정 모델로 업데이트
          messages: groqMessages,
          temperature: 0.3,
          max_tokens: 2048,
        }),
      });

      if (groqResponse.ok) {
        const groqData = await groqResponse.json();
        analysis = groqData.choices?.[0]?.message?.content;
      }
    } catch (err: any) {
      console.error("Groq attempt failed:", err.message);
    }

    // fallback to Gemini if Groq fails
    if (!analysis && process.env.GOOGLE_GEMINI_API_KEY) {
      try {
        console.log("Attempting analysis with Gemini 2.5 Flash...");
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent(`${systemPrompt}\n\n사용자 질문: ${groqMessages[groqMessages.length - 1].content}`);
        analysis = result.response.text();
      } catch (err: any) {
        console.error("Gemini fallback failed:", err.message);
      }
    }

    if (!analysis) {
      throw new Error("분석 리포트를 생성할 수 없습니다.");
    }

    return NextResponse.json({ analysis });

  } catch (error: any) {
    console.error("AI 분석 서비스 에러:", error);
    // 에러 발생 시에도 유효한 JSON을 반환하도록 강제
    return NextResponse.json(
      { error: error.message || "서버 내부 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
