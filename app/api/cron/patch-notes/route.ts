import { NextResponse } from "next/server";
import { parse } from "node-html-parser";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function GET(request: Request) {
  try {
    // 1. 보안 체크 (Vercel Cron 등을 위한 Secret 등 필요 시 추가)
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. PUBG 공식 뉴스 페이지 (한국어) 호출
    const targetUrl = "https://pubg.com/ko/news?category=patch_notes";
    const response = await fetch(targetUrl, {
        next: { revalidate: 3600 }, // 1시간 캐시
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
    });
    
    if (!response.ok) throw new Error("Failed to fetch PUBG news");
    const html = await response.text();

    // 3. 최신 기물(Post) 데이터 추출 - "Data-First" 접근법
    let title: string | null = null;
    let fullUrl: string | null = null;
    let thumbnail: string | null = null;
    let date: string = "";

    // window.__NUXT__ 내에서 postId와 title 쌍을 직접 추출 (진짜 ID 9809 등을 찾기 위함)
    const nuxtRegex = /postId:(\d+),[\s\S]{1,1000}title:"([^"]*?패치 노트[^"]*?)"/g;
    let match;
    const matches: { id: string, title: string, index: number }[] = [];
    
    while ((match = nuxtRegex.exec(html)) !== null) {
        matches.push({ id: match[1], title: match[2], index: match.index });
    }

    if (matches.length > 0) {
        const latest = matches[0];
        title = latest.title;
        fullUrl = `https://pubg.com/ko/news/${latest.id}?category=patch_notes`;
        
        const nearbyArea = html.substring(latest.index, latest.index + 2000);
        const thumbMatch = nearbyArea.match(/thumbUrl:"(https:[^"]+)"/);
        const dateMatch = nearbyArea.match(/createdAt:"([^"]+)"/);
        
        if (thumbMatch) thumbnail = thumbMatch[1].replace(/\\u002F/g, "/");
        if (dateMatch) date = dateMatch[1].split(" ")[0]; 
    }

    // 만약 Nuxt 파싱이 실패하면 기존 DOM 방식 시도 (백업)
    if (!fullUrl) {
        const root = parse(html);
        const latestPost = root.querySelector(".news-list__posts a.post") || root.querySelector("a.post");
        if (latestPost) {
            title = title || latestPost.querySelector("dt")?.text.trim() || latestPost.querySelector(".post__description dt")?.text.trim() || null;
            const attrHref = latestPost.getAttribute("href");
            if (attrHref && !attrHref.includes("category=")) {
                fullUrl = attrHref.startsWith("http") ? attrHref : `https://pubg.com${attrHref}`;
            }
            thumbnail = thumbnail || latestPost.querySelector("img")?.getAttribute("src") || null;
        }
    }

    const category = "패치노트";

    // --- AI 요약 로직 추가 ---
    let aiSummary = "";
    try {
        if (process.env.GOOGLE_GEMINI_API_KEY && fullUrl) {
            // 1. 상세 페이지 본문 텍스트 추출
            const detailResponse = await fetch(fullUrl, { 
                cache: 'no-store',
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                }
            });
            
            if (detailResponse.ok) {
                const detailHtml = await detailResponse.text();
                const detailRoot = parse(detailHtml);
                // 본문 영역 추출 (다양한 선택자 시도)
                const contentElement = detailRoot.querySelector(".post-detail__content") || 
                                       detailRoot.querySelector(".news-detail__content") ||
                                       detailRoot.querySelector(".post-content") ||
                                       detailRoot.querySelector("article");
                
                if (contentElement) {
                    const rawText = contentElement.text.trim().substring(0, 5000); 
                    
                    if (rawText.length < 100) {
                        console.warn("Content too short, might have picked wrong elements");
                    }
                    
                    // 2. Gemini AI 요약 요청
                    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
                    
                    // 진담 완료된 최신 주력 모델 gemini-2.5-flash 사용
                    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                    
                    const prompt = `다음은 배틀그라운드(PUBG)의 패치노트 내용입니다.
                    게이머들이 놓쳐서 안될 중요한 정보들과 추가점 및
                    핵심 변경점을 3~7개의 불렛 포인트로 한국어로 요약해줘.
                    
                    [내용]:
                    ${rawText}`;

                    const result = await model.generateContent(prompt);
                    const responseText = result.response.text();
                    aiSummary = responseText.trim();
                } else {
                    console.error("Could not find content element in detail page");
                }
            } else {
                console.error("Detail page fetch failed with status:", detailResponse.status);
            }
        }
    } catch (error: any) {
        console.error("AI Summarization detail error:", error.message || error);
        // 404 에러 등이 발생할 경우 로그에 기록
    }
    // ----------------------

    // 4. 중복 체크 (DB 활용)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // sync_history 테이블에서 마지막 URL 확인
    const { data: lastSync } = await supabaseAdmin
      .from("sync_history")
      .select("last_url")
      .eq("type", "patch_notes")
      .single();

    if (lastSync?.last_url === fullUrl) {
      return NextResponse.json({ message: "No new patch notes found" });
    }

    // 5. 디스코드 발송 (패치노트 전용 웹훅)
    const patchNotesWebhookUrl = process.env.DISCORD_PATCH_NOTES_WEBHOOK_URL || process.env.DISCORD_COMMUNITY_WEBHOOK_URL;
    if (patchNotesWebhookUrl) {
      const embed = {
        title: `🆕 [${category}] ${title}`,
        description: aiSummary ? `### 🤖 AI 핵심 요약\n${aiSummary}` : `배틀그라운드 최신 소식이 올라왔습니다!\n게시판 날짜: ${date}`,
        url: fullUrl,
        thumbnail: thumbnail ? { url: thumbnail } : undefined,
        color: 0xf2a900, 
        footer: { text: "PUBG 통합 지도 봇 | 패치노트 알리미" },
        timestamp: new Date().toISOString(),
      };

      await fetch(patchNotesWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });

      // 6. 상태 업데이트
      if (lastSync) {
        await supabaseAdmin
          .from("sync_history")
          .update({ last_url: fullUrl, updated_at: new Date().toISOString() })
          .eq("type", "patch_notes");
      } else {
        await supabaseAdmin
          .from("sync_history")
          .insert({ type: "patch_notes", last_url: fullUrl });
      }
    }

    return NextResponse.json({ success: true, post: { title, fullUrl } });
  } catch (error: any) {
    console.error("Patch notes cron error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
