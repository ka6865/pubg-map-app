import { NextResponse } from "next/server";
import { parse } from "node-html-parser";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

// AI 요약 생성 함수 (Gemini Pro -> Flash -> Groq 순차 시도)
async function generateAISummary(rawText: string): Promise<string> {
  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  if (!geminiKey && !groqKey) return "";

  const prompt = `배틀그라운드 패치노트를 3~7개의 불렛포인트로 핵심만 한국어로 요약해줘. 게이머들이 꼭 알아야 할 변경점 위주로 작성해: ${rawText}`;

  // 1. Gemini 시도 (Pro -> Flash)
  if (geminiKey) {
    const genAI = new GoogleGenerativeAI(geminiKey);
    // 2026년 현재 v1beta에서 활성화된 최신 모델 리스트
    const geminiModels = ["gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-2.5-flash"];
    
    for (const modelId of geminiModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelId });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        if (text && text.length > 20) {
          console.log(`Summary generated via Gemini (${modelId})`);
          return text.trim();
        }
      } catch (err: any) {
        console.warn(`Gemini ${modelId} failed:`, err.message || err);
      }
    }
  }

  // 2. Groq 시도 (Gemini 모두 실패 시)
  if (groqKey) {
    try {
      console.log("Attempting fallback with Groq (Llama 3.3)...");
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile", // 단종된 3.1 대신 최신 3.3 사용
          messages: [
            { role: "system", content: "너는 배틀그라운드 전문 분석가야. 패치노트의 핵심을 요약하는 전문가로서 게이머들에게 유용한 정보를 제공해." },
            { role: "user", content: prompt }
          ],
          temperature: 0.5
        })
      });

      if (groqRes.ok) {
        const groqData = await groqRes.json();
        const text = groqData.choices?.[0]?.message?.content;
        if (text) {
          console.log("Summary generated via Groq (Llama 3.3)");
          return text.trim();
        }
      }
    } catch (err: any) {
      console.error("Groq fallback failed:", err.message || err);
    }
  }

  return "";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");
    const force = searchParams.get("force") === "true";
    const manualUrl = searchParams.get("url"); // 수동 입력 URL

    // 보안 인증 체크
    const isCronAuth = process.env.CRON_SECRET && secret === process.env.CRON_SECRET;
    const isAdminAuth = process.env.ADMIN_SECRET_TOKEN && secret === process.env.ADMIN_SECRET_TOKEN;
    if (!isCronAuth && !isAdminAuth && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let title = "";
    let postId = "";
    let fullUrl = "";
    let thumbnail = null;
    let date = new Date().toISOString().split("T")[0];

    if (manualUrl) {
      // 2A. 수동 URL 처리 로직
      console.log(">>> [MANUAL_MODE] URL:", manualUrl);
      fullUrl = manualUrl;
      const idMatch = manualUrl.match(/\/news\/(\d+)/);
      postId = idMatch ? idMatch[1] : `manual_${Date.now()}`;
      
      // 수동 모드에서는 제목을 가져오기 위해 먼저 페이지를 한 번 읽습니다.
      const res = await fetch(manualUrl, { headers: { "User-Agent": "Mozilla/5.0..." } });
      if (res.ok) {
        const html = await res.text();
        const root = parse(html);
        title = root.querySelector("title")?.text.split("|")[0].trim() || "직접 입력된 패치노트";
        // Nuxt 데이터에서 썸네일 탐색 시도
        const thumbMatch = html.match(/thumbUrl\s*:\s*"(https:[^"]+)"/i);
        thumbnail = thumbMatch ? thumbMatch[1].replace(/\\u002F/g, "/") : null;
      } else {
        title = "수동 게시물";
      }
    } else {
      // 2B. 자동 스크래핑 모드 (기존 로직)
      const targetUrl = "https://pubg.com/ko/news";
      const response = await fetch(targetUrl, {
          next: { revalidate: 0 }, 
          headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
          }
      });
      
      if (!response.ok) throw new Error("공식 홈페이지 뉴스를 가져오지 못했습니다.");
      const html = await response.text();

      const nuxtRegex = /postId:(\d+),(?:(?!postId:).)*?title:"([^"]*?패치 노트[^"]*?)"/g;
      let match;
      const matches: { id: string, title: string, index: number }[] = [];
      
      while ((match = nuxtRegex.exec(html)) !== null) {
          matches.push({ id: match[1], title: match[2], index: match.index });
      }

      if (matches.length === 0) {
        return NextResponse.json({ success: true, message: "검색된 최신 패치노트가 없습니다." });
      }

      const latest = matches[0];
      title = latest.title;
      postId = latest.id;
      fullUrl = `https://pubg.com/ko/news/${postId}`;
      
      const nearbyArea = html.substring(latest.index, latest.index + 4000);
      const thumbMatch = nearbyArea.match(/thumbUrl\s*:\s*"(https:[^"]+)"/i);
      const dateMatch = nearbyArea.match(/createdAt:"([^"]+)"/);
      thumbnail = thumbMatch ? thumbMatch[1].replace(/\\u002F/g, "/") : null;
      date = dateMatch ? dateMatch[1].split(" ")[0] : new Date().toISOString().split("T")[0];
    }

    // 4. 중복 체크
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: lastSync } = await supabaseAdmin
      .from("sync_history")
      .select("last_url")
      .eq("type", "patch_notes")
      .single();

    if (!force && lastSync?.last_url === fullUrl) {
      return NextResponse.json({ message: "No new patch notes found" });
    }

    // 5. AI 요약 생성 (다중 모델 시도)
    let aiSummary = "";
    try {
      const detailRes = await fetch(fullUrl, { cache: 'no-store' });
      if (detailRes.ok) {
          const detailHtml = await detailRes.text();
          const detailRoot = parse(detailHtml);
          const contentArea = detailRoot.querySelector(".post-detail__content") || 
                              detailRoot.querySelector(".news-detail__content") ||
                              detailRoot.querySelector("article") ||
                              detailRoot.querySelector(".news-detail__body");
          
          let rawText = contentArea ? contentArea.text.trim() : "";
          
          // [Deep Data Scraper] 만약 DOM 파싱으로 텍스트를 못 찾으면 Nuxt 데이터에서 직접 추출
          if (rawText.length < 100) {
            console.log("DOM text too short, searching Nuxt data...");
            const nuxtMatch = detailHtml.match(/content\s*:\s*"((?:\\.|[^"\\])*)"/);
            if (nuxtMatch) {
              rawText = nuxtMatch[1].replace(/\\u002F/g, "/").replace(/\\"/g, '"');
            }
          }

          if (rawText.length > 50) {
              aiSummary = await generateAISummary(rawText.substring(0, 5000));
          }

          // [최후의 보루] AI 요약이 완전히 실패했을 경우 (빈 내용이거나 너무 짧을 때)
          if (!aiSummary || aiSummary.length < 20) {
            console.error("!!! [CRITICAL] All AI models failed to summarize. Sending Discord Alert...");
            
            // 디스코드 제보 채널로 알람 발송
            const failureWebhook = process.env.DISCORD_WEBHOOK_URL;
            if (failureWebhook) {
              const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
              const secret = process.env.ADMIN_SECRET_TOKEN || "";
              const quickSyncLink = `${siteUrl}/api/cron/patch-notes?secret=${secret}&force=true&url=${encodeURIComponent(fullUrl)}`;

              await fetch(failureWebhook, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  content: `⚠️ **[AI 요약 실패 제보]**\n새로운 패치노트를 요약하는 데 모든 AI 모델이 실패했습니다.\n\n**제목:** ${title}\n**원문 링크:** ${fullUrl}\n\n--- \n🚀 **[여기를 클릭하여 이 기사로 즉시 동기화 실행]**\n${quickSyncLink}\n\n관리자님, 위 링크를 클릭하시면 관리자 페이지 접속 없이 즉시 동기화가 진행됩니다! @everyone`
                })
              });
            }
            
            return NextResponse.json({ 
              success: false, 
              reason: "ai_failed",
              message: "AI 요약에 실패하여 디코로 제보했습니다. 디코를 확인해주세요!" 
            });
          }
      }
    } catch (err: any) {
      console.error("Content extraction or summary failed:", err.message || err);
    }
    
    if (!aiSummary) {
      aiSummary = "이번 패치는 세부 데이터가 특수하게 구성되어 요약 로봇이 내용을 읽지 못했습니다. 아래 '공식 패치노트 보러가기'를 클릭해 자세한 내용을 확인해 주세요!";
    }

    // 6. 프리미엄 인라인 스타일 UI 구성 (완벽한 중앙 정렬 및 프리미엄 카드 디자인)
    const formattedContent = `
      <div style="width: 100%; max-width: 720px; margin: 30px auto; font-family: 'Pretendard', sans-serif; background: #1a1a1a; border: 1px solid rgba(242,169,0,0.3); border-radius: 16px; overflow: hidden; box-shadow: 0 12px 40px rgba(0,0,0,0.6); text-align: left;">
        <!-- Header Section: 완벽 중앙 정렬 -->
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(180deg, rgba(242,169,0,0.1) 0%, transparent 100%); padding: 32px 24px; border-bottom: 1px solid rgba(242,169,0,0.1); text-align: center;">
          <span style="font-size: 40px; margin-bottom: 12px; filter: drop-shadow(0 0 10px rgba(242,169,0,0.3));">🤖</span>
          <h3 style="color: #F2A900; font-size: 22px; font-weight: 900; margin: 0; letter-spacing: -0.5px;">BGMS AI 브리핑</h3>
        </div>

        <!-- Summary Section -->
        <div style="padding: 40px; color: #e0e0e0; line-height: 1.8; font-size: 15px; background-image: radial-gradient(circle at top right, rgba(242,169,0,0.05) 0%, transparent 80%);">
          <div style="white-space: pre-wrap; word-break: keep-all;">
            ${aiSummary}
          </div>
        </div>

        <!-- Action Section: 중앙 버튼 배치 -->
        <div style="padding: 32px 40px; background: rgba(0,0,0,0.2); border-top: 1px solid rgba(255,255,255,0.03); text-align: center; display: flex; flex-direction: column; align-items: center;">
          <a href="${fullUrl}" target="_blank" rel="noopener noreferrer" 
             style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #F2A900 0%, #ee9900 100%); color: #000; font-weight: 900; font-size: 16px; text-decoration: none; border-radius: 8px; box-shadow: 0 6px 20px rgba(242,169,0,0.3); transition: transform 0.2s;">
            🔗 공식 패치노트 보러가기
          </a>
          <p style="color: #666; font-size: 12px; margin-top: 20px; letter-spacing: -0.2px;">상세한 장비 밸런스 및 맵 변경 사항은 공식 홈페이지 원문에서 확인하실 수 있습니다.</p>
        </div>
      </div>
    `;

    // 7. 디스코드 발송
    const patchNotesWebhookUrl = process.env.DISCORD_PATCH_NOTES_WEBHOOK_URL || process.env.DISCORD_COMMUNITY_WEBHOOK_URL;
    if (patchNotesWebhookUrl) {
      const embed = {
        title: `🆕 [패치노트] ${title}`,
        description: `### 🤖 AI 핵심 요약\n${aiSummary}`,
        url: fullUrl,
        thumbnail: thumbnail ? { url: thumbnail } : undefined,
        color: 0xf2a900, 
        footer: { text: "BGMS 통합 지도 봇 | 업데이트 알리미" },
        timestamp: new Date().toISOString(),
      };

      await fetch(patchNotesWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });
    }

    // 8. DB 등록 (DB 레벨 중복 방지 및 유니코드 보정)
    const cleanTitle = title.normalize("NFC").trim();
    console.log(">>> [DB_SAVE_START] Title:", cleanTitle);
    
    // [중요] DB에 없는 updated_at, created_at 등을 제거하고 검증된 컬럼만 사용
    const { error: postError } = await supabaseAdmin.from("posts").upsert({
      title: cleanTitle,
      content: formattedContent,
      author: "BGMS 시스템",
      category: "패치노트",
      is_notice: true,
      image_url: null,
      user_id: null
    }, { 
      onConflict: 'title',
      ignoreDuplicates: false 
    });

    if (postError) {
        console.error(">>> [DB_SAVE_ERROR]:", postError.message);
        return NextResponse.json({ success: false, message: postError.message });
    }
    console.log(">>> [DB_SAVE_SUCCESS]");

    // 9. 동기화 상태 업데이트
    console.log(">>> [SYNC_HISTORY_START]");
    if (lastSync) {
      await supabaseAdmin.from("sync_history").update({ last_url: fullUrl, updated_at: new Date().toISOString() }).eq("type", "patch_notes");
    } else {
      await supabaseAdmin.from("sync_history").insert({ type: "patch_notes", last_url: fullUrl });
    }
    console.log(">>> [SYNC_HISTORY_SUCCESS]");

    return NextResponse.json({ success: true, post: { title: cleanTitle, fullUrl } });

  } catch (error: any) {
    console.error("Patch notes cron error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
