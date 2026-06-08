import { NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, FunctionDeclaration, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { withAuthGuard } from "@/utils/supabase/guard";
import puppeteer from "puppeteer";

// 1. 도구 선언 (Function Declarations)
const getDbStatisticsDecl: FunctionDeclaration = {
  name: "get_db_statistics",
  description: "DB에서 실제 PUBG 매치 정보, 유저 통계, 맵 선호도, API 에러 통계, 코칭 스타일 선호도 정보를 집계하여 텍스트로 가져옵니다.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      statType: {
        type: SchemaType.STRING,
        description: "조회할 통계 유형: 'map_preference' (최근 인기 맵), 'top_players' (최고 딜량 랭커), 'api_errors' (최근 연동 에러 카운트), 'coaching_preference' (AI 코칭 맛 선택 비중), 'general_stats' (전체 유저 평균 킬/딜량)"
      }
    },
    required: ["statType"]
  }
};

const createBoardPostDecl: FunctionDeclaration = {
  name: "create_board_post",
  description: "배틀그라운드 커뮤니티 자유게시판에 Markdown 본문을 포함한 분석 리포트 글을 작성하여 등록합니다. 반드시 정중하고 격조 있는 존댓말 어조여야 합니다.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      title: {
        type: SchemaType.STRING,
        description: "게시글 제목"
      },
      content: {
        type: SchemaType.STRING,
        description: "Markdown 포맷의 게시글 본문 텍스트"
      }
    },
    required: ["title", "content"]
  }
};

const takeMapScreenshotDecl: FunctionDeclaration = {
  name: "take_map_screenshot",
  description: "배틀그라운드 특정 지도 화면을 가상 브라우저로 띄우고, 특정 레이어(예: 'secret_room' 비밀의방)가 켜진 상태로 고화질 스크린샷을 찍어 저장소(Storage) 업로드 후 이미지 URL을 반환합니다.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      mapName: {
        type: SchemaType.STRING,
        description: "캡처할 배그 맵 명칭 (예: 'miramar', 'erangel', 'taego')"
      },
      layer: {
        type: SchemaType.STRING,
        description: "활성화할 레이어 필터 명칭 (예: 'secret_room' [비밀의방], 'vehicle' [차량 젠])"
      }
    },
    required: ["mapName", "layer"]
  }
};

async function runDbStatQuery(statType: string, supabase: any): Promise<string> {
  try {
    if (statType === "map_preference") {
      const { data, error } = await supabase
        .from("match_stats_raw")
        .select("map_name")
        .order("created_at", { ascending: false })
        .limit(2000);

      if (error) throw error;
      const counts: Record<string, number> = {};
      data?.forEach((r: any) => {
        counts[r.map_name] = (counts[r.map_name] || 0) + 1;
      });
      return JSON.stringify({
        description: "최근 2000건의 매치 데이터를 기반으로 집계한 인기 맵 선호도 순위입니다.",
        data: counts
      });
    }

    if (statType === "top_players") {
      const { data, error } = await supabase
        .from("match_stats_raw")
        .select("player_id, damage, kills, map_name")
        .eq("win_place", 1)
        .order("damage", { ascending: false })
        .limit(5);

      if (error) throw error;
      return JSON.stringify({
        description: "최근 1등 매치 중 최다 딜량을 기록한 랭커 탑 5인 목록입니다.",
        data
      });
    }

    if (statType === "api_errors") {
      const { data, error } = await supabase
        .from("pubg_api_errors")
        .select("message, status")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      const counts: Record<string, number> = {};
      data?.forEach((r: any) => {
        const key = `${r.status} - ${r.message}`;
        counts[key] = (counts[key] || 0) + 1;
      });
      return JSON.stringify({
        description: "최근 발생한 PUBG API 연동 에러 100건의 빈도별 집계 결과입니다.",
        data: counts
      });
    }

    if (statType === "coaching_preference") {
      const { data, error } = await supabase
        .from("match_ai_coaching_cache")
        .select("coaching_style");

      if (error) throw error;
      const counts: Record<string, number> = {};
      data?.forEach((r: any) => {
        counts[r.coaching_style] = (counts[r.coaching_style] || 0) + 1;
      });
      return JSON.stringify({
        description: "유저들이 요청한 AI 코칭 스타일 선호 비중입니다.",
        data: counts
      });
    }

    if (statType === "general_stats") {
      const { data, error } = await supabase
        .from("match_stats_raw")
        .select("kills, damage")
        .order("created_at", { ascending: false })
        .limit(2000);

      if (error) throw error;
      if (!data || data.length === 0) return "No data found";
      let totalKills = 0;
      let totalDamage = 0;
      data.forEach((r: any) => {
        totalKills += r.kills || 0;
        totalDamage += r.damage || 0;
      });
      return JSON.stringify({
        description: "최근 2000건의 매치 기준 일반 유저 평균 통계 성적입니다.",
        averageKills: (totalKills / data.length).toFixed(2),
        averageDamage: (totalDamage / data.length).toFixed(1)
      });
    }

    return "알 수 없는 통계 유형입니다.";
  } catch (e: any) {
    return `조회 실패: ${e.message}`;
  }
}

async function createBoardPost(title: string, content: string, supabase: any, userId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("posts")
      .insert({
        title,
        content,
        author_id: userId,
        author_nickname: "BGMS_AI_BOT",
        category: "통계/팁"
      })
      .select("id")
      .single();

    if (error) throw error;
    return JSON.stringify({
      success: true,
      message: "자유게시판에 성공적으로 글이 발행되었습니다.",
      postId: data?.id
    });
  } catch (e: any) {
    return `포스팅 등록 실패: ${e.message}`;
  }
}

async function takeMapScreenshot(mapName: string, layer: string, supabase: any): Promise<string> {
  let browser = null;
  try {
    // 1. Storage 버킷이 존재하지 않을 시 자동 생성 (안전장치)
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets?.some((b: any) => b.name === "map-captures")) {
        await supabase.storage.createBucket("map-captures", {
          public: true,
          fileSizeLimit: 5242880 // 5MB
        });
      }
    } catch (bucketErr) {
      console.warn("[SCREENSHOT] Bucket lookup/create failed:", bucketErr);
    }

    // 2. 가상 브라우저 기동
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const mapUrl = `${baseUrl}/maps/${mapName.toLowerCase()}?layer=${layer}`;

    // 페이지 진입 후 지도 로딩 대기
    await page.goto(mapUrl, { waitUntil: "networkidle2" });
    await new Promise(resolve => setTimeout(resolve, 2500)); // Leaflet 마커 렌더링 유예 시간

    const screenshotBuffer = await page.screenshot({ type: "png" });

    // 3. Storage 업로드
    const filename = `${mapName.toLowerCase()}_${layer}_${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("map-captures")
      .upload(filename, screenshotBuffer, {
        contentType: "image/png",
        upsert: true
      });

    if (uploadError) throw uploadError;

    // 4. URL 추출
    const { data: urlData } = supabase.storage
      .from("map-captures")
      .getPublicUrl(filename);

    return JSON.stringify({
      success: true,
      message: `${mapName} 지도의 ${layer} 레이어 화면을 성공적으로 캡처했습니다.`,
      imageUrl: urlData?.publicUrl || ""
    });
  } catch (e: any) {
    return `지도 캡처 실패: ${e.message}`;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function POST(request: Request) {
  try {
    // 🔒 [보안] JWT 인증 가드 (어드민 전용 격리)
    const auth = await withAuthGuard();
    if (auth.error) return auth.error;
    const { supabaseAdmin: supabase, user } = auth;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { message, systemPrompt = "", history = [] } = body;

    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No API Key" }, { status: 500 });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const genAI = new GoogleGenerativeAI(apiKey);
          const modelsToTry = [
            "gemini-3.1-flash-lite",
            "gemini-3-flash-preview",
            "gemini-2.5-flash"
          ];

          let chat: any = null;
          let result: any = null;

          for (const modelName of modelsToTry) {
            try {
              const model = genAI.getGenerativeModel({
                model: modelName,
                safetySettings: [
                  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE }
                ]
              });

              chat = model.startChat({
                systemInstruction: systemPrompt,
                history: history.map((h: any) => ({
                  role: h.role === "model" ? "model" : "user",
                  parts: [{ text: h.content }]
                })),
                tools: [{
                  functionDeclarations: [getDbStatisticsDecl, createBoardPostDecl, takeMapScreenshotDecl]
                }]
              });

              result = await chat.sendMessage(message);
              break;
            } catch (err: any) {
              console.warn(`[BOT-RUN] Model ${modelName} failed, trying fallback:`, err.message || err);
              continue;
            }
          }

          if (!chat || !result) {
            throw new Error("모든 AI 모델 연결에 실패했습니다.");
          }

          const response = result.response;
          let functionCalls = response.functionCalls ? response.functionCalls() : undefined;
          
          while (functionCalls && functionCalls.length > 0) {
            const functionResponses = [];
            
            for (const call of functionCalls) {
              // 1) 툴 시작 전송
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: "tool_start",
                    toolName: call.name,
                    params: call.args
                  }) + "\n"
                )
              );

              let toolResult = "";
              let status: "success" | "failed" = "success";
              
              try {
                const args = call.args as any;
                if (call.name === "get_db_statistics") {
                  toolResult = await runDbStatQuery(args.statType, supabase);
                } else if (call.name === "create_board_post") {
                  toolResult = await createBoardPost(args.title, args.content, supabase, user.id);
                } else if (call.name === "take_map_screenshot") {
                  toolResult = await takeMapScreenshot(args.mapName, args.layer, supabase);
                } else {
                  toolResult = "존재하지 않는 도구입니다.";
                  status = "failed";
                }
              } catch (err: any) {
                toolResult = `Error: ${err.message}`;
                status = "failed";
              }

              // 2) 툴 종료 전송
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: "tool_end",
                    toolName: call.name,
                    status,
                    result: toolResult
                  }) + "\n"
                )
              );

              functionResponses.push({
                functionResponse: { name: call.name, response: { result: toolResult } }
              });
            }

            const nextResult = await chat.sendMessage(functionResponses);
            const nextResponse = nextResult.response;
            functionCalls = nextResponse.functionCalls ? nextResponse.functionCalls() : undefined;
            
            if (!functionCalls || functionCalls.length === 0) {
              const text = nextResponse.text();
              if (text) {
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({
                      type: "chunk",
                      data: text
                    }) + "\n"
                  )
                );
              }
            }
          }

          const text = response.text();
          const finalCalls = response.functionCalls ? response.functionCalls() : undefined;
          if (text && (!finalCalls || finalCalls.length === 0)) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "chunk",
                  data: text
                }) + "\n"
              )
            );
          }

          controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
        } catch (e: any) {
          controller.error(e);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache"
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
