import { NextResponse } from "next/server";
import { parse } from "node-html-parser";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. 공식 홈페이지 크롤링 (이미 검증된 디스코드 봇 로직)
    const targetUrl = "https://pubg.com/ko/news?category=patch_notes";
    const response = await fetch(targetUrl, {
      cache: 'no-store',
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });
    
    if (!response.ok) throw new Error("공식 홈페이지 뉴스를 가져오지 못했습니다.");
    const html = await response.text();

    // 2. 최신 게시글 데이터 추출 (Nuxt Hydration 데이터 활용)
    const nuxtRegex = /postId:(\d+),[\s\S]{1,1000}title:"([^"]*?패치 노트[^"]*?)"/g;
    const match = nuxtRegex.exec(html);
    
    if (!match) {
      return NextResponse.json({ success: true, message: "새로운 패치노트가 없습니다." });
    }

    const postId = match[1];
    const title = match[2];
    const fullUrl = `https://pubg.com/ko/news/${postId}?category=patch_notes`;

    // 3. 중복 체크 (sync_history 및 posts 제목)
    const { data: lastSync } = await supabase
      .from("sync_history")
      .select("last_url")
      .eq("type", "patch_notes")
      .single();

    if (lastSync?.last_url === fullUrl) {
      return NextResponse.json({ success: true, message: "이미 최신 패치노트가 등록되어 있습니다." });
    }

    // 4. 상세 페이지 본문 요약 (AI)
    let aiSummary = "";
    if (process.env.GOOGLE_GEMINI_API_KEY) {
      try {
        const detailRes = await fetch(fullUrl, { cache: 'no-store' });
        if (detailRes.ok) {
          const detailHtml = await detailRes.text();
          const detailRoot = parse(detailHtml);
          const contentArea = detailRoot.querySelector(".post-detail__content") || 
                              detailRoot.querySelector(".news-detail__content") ||
                              detailRoot.querySelector("article");
          
          if (contentArea) {
            const rawText = contentArea.text.trim().substring(0, 4000);
            const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const prompt = `배틀그라운드 패치노트를 3~7개의 불렛포인트로 핵심만 한국어로 요약해줘: ${rawText}`;
            const result = await model.generateContent(prompt);
            aiSummary = result.response.text();
          }
        }
      } catch (aiErr) {
        console.error('AI Summary failed, using fallback:', aiErr);
        aiSummary = "공식 홈페이지에서 상세 패치 내용을 확인해 주세요.";
      }
    }

    // 5. 게시판 본문 HTML 가공 (상단 AI 요약 / 하단 링크)
    const formattedContent = `
      <div class="patch-note-container">
        <div class="bg-[#F2A900]/10 border border-[#F2A900]/30 rounded-xl p-6 mb-8">
          <h3 class="flex items-center gap-2 text-[#F2A900] font-black text-xl mb-4">
            🤖 AI 핵심 요약
          </h3>
          <div class="prose prose-invert max-w-none text-gray-200 leading-relaxed whitespace-pre-wrap">
            ${aiSummary || "요약을 가져오지 못했습니다. 공식 홈페이지에서 전체 내용을 확인해 주세요."}
          </div>
        </div>

        <div class="flex flex-col items-center justify-center p-8 bg-[#1a1a1a] rounded-xl border border-white/5">
          <p class="text-gray-400 text-sm mb-4">더 자세한 패치 정보와 이미지 가이드는 공식 홈페이지에서 만나보세요!</p>
          <a href="${fullUrl}" target="_blank" rel="noopener noreferrer" 
             class="inline-flex items-center gap-2 px-8 py-3 bg-[#F2A900] text-black font-black rounded-lg hover:bg-[#cc8b00] transition-all transform active:scale-95 shadow-lg shadow-[#F2A900]/20">
            🔗 공식 패치노트 보러가기
          </a>
        </div>
      </div>
    `;

    // 6. DB 등록 (posts & sync_history)
    const { error: insertError } = await supabase.from('posts').insert([{
      title: title,
      content: formattedContent,
      author: 'BGMS 시스템',
      category: '패치노트',
      is_notice: true,
      image_url: null,
      user_id: null
    }]);

    if (insertError) throw new Error(`게시물 등록 실패: ${insertError.message}`);

    if (lastSync) {
      await supabase.from("sync_history").update({ last_url: fullUrl, updated_at: new Date().toISOString() }).eq("type", "patch_notes");
    } else {
      await supabase.from("sync_history").insert({ type: "patch_notes", last_url: fullUrl });
    }

    return NextResponse.json({ success: true, message: `새로운 패치노트('${title}')가 게시판에 등록되었습니다!` });

  } catch (err: any) {
    console.error('Manual sync error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
