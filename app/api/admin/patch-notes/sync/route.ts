import { NextResponse } from "next/server";
import { parse } from "node-html-parser";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@/utils/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// URL 정제 헬퍼 (트래커 제거 및 필수 파라미터만 유지)
function cleanUrl(url: string) {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    const newParams = new URLSearchParams();
    const allowed = ['articleId', 'bbsId', 'category', 'postId'];
    allowed.forEach(p => { if (params.has(p)) newParams.set(p, params.get(p)!); });
    urlObj.search = newParams.toString();
    return urlObj.toString();
  } catch (e) { return url; }
}

// AI 요약 헬퍼 함수 (2026년 표준 모델 Gemini 2.5-Flash 적용)
async function summarizeText(rawText: string) {
  if (!process.env.GOOGLE_GEMINI_API_KEY) {
    return "❌ ERROR: API 키가 설정되지 않았습니다. (.env.local 확인)";
  }
  
  const textToProcess = rawText.substring(0, 8000).trim();
  if (textToProcess.length < 50) {
    return `❌ ERROR: 수집된 텍스트가 너무 짧습니다 (${textToProcess.length}자). 본문을 읽지 못했을 가능성이 큽니다.`;
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
  
  // 2026년 기준 가장 안정적인 별칭 우선 순위 설정
  const modelsToTry = [
    "gemini-flash-latest", 
    "gemini-2.5-flash", 
    "gemini-3.1-flash-lite-preview",
    "gemini-pro-latest"
  ];

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const prompt = `배틀그라운드 패치노트를 3~7개의 불렛포인트로 핵심만 한국어로 요약해줘. 다음 텍스트 기반으로 작성:\n\n${textToProcess}`;
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      
      if (text && text.length > 5) return text;
    } catch (err: any) {
      const errorMsg = err.message || "";
      if (errorMsg.includes("429") || errorMsg.includes("quota") || 
          errorMsg.includes("503") || errorMsg.includes("Service Unavailable") ||
          errorMsg.includes("deadline exceeded")) {
        console.warn(`⚠️ [AI] ${modelName} 서버 혼잡으로 다음 가용 모델로 전환합니다.`);
        continue; 
      }
      return `❌ AI 요약 중 오류가 발생했습니다: ${errorMsg}`;
    }
  }
  return "❌ 현재 AI 서비스 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.";
}

// 1. 글로벌 공식 패치노트 파싱 
async function fetchOfficialPatchNote(supabaseAdmin: any, manualUrl?: string) {
  const targetUrl = manualUrl ? cleanUrl(manualUrl) : "https://pubg.com/ko/news?category=patch_notes";
  const response = await fetch(targetUrl, { cache: 'no-store', headers: { "User-Agent": "Mozilla/5.0" }});
  if (!response.ok) throw new Error("공식 홈페이지 접속 실패");
  const html = await response.text();
  let title = "";
  let fullUrl = "";

  if (manualUrl) {
    const root = parse(html);
    title = root.querySelector("h1")?.text.trim() || root.querySelector("title")?.text.split("|")[0].trim() || "글로벌 패치노트";
    fullUrl = targetUrl;
  } else {
    const nuxtRegex = /postId:(\d+),[\s\S]{1,1000}title:"([^"]*?패치 노트[^"]*?)"/g;
    const match = nuxtRegex.exec(html);
    if (!match) return null;
    fullUrl = `https://pubg.com/ko/news/${match[1]}?category=patch_notes`;
    title = match[2];
  }

  if (!manualUrl) {
    const { data: lastSync } = await supabaseAdmin.from("sync_history").select("last_url").eq("type", "patch_notes").single();
    if (lastSync?.last_url === fullUrl) return null;
  }

  let summaryOrError = "";
  try {
    const detailRes = await fetch(fullUrl, { cache: 'no-store' });
    if (detailRes.ok) {
      const root = parse(await detailRes.text());
      const content = root.querySelector(".post-detail__content") || root.querySelector(".news-detail__content") || root.querySelector("article");
      summaryOrError = await summarizeText(content?.text || "");
    } else {
      summaryOrError = `❌ 본문 접속 실패 (${detailRes.status})`;
    }
  } catch(e: any) { summaryOrError = `❌ 시스템 오류: ${e.message}`; }

  return { type: "patch_notes", title, fullUrl, summaryOrError };
}

// 2. 카카오 무점검 패치 파싱
async function fetchKakaoPatchNote(supabaseAdmin: any, manualUrl: string) {
  const targetUrl = cleanUrl(manualUrl);
  const response = await fetch(targetUrl, { cache: 'no-store', headers: { "User-Agent": "Mozilla/5.0" }});
  if (!response.ok) throw new Error(`카카오 페이지 접속 실패 (${response.status})`);
  
  const root = parse(await response.text());
  let title = root.querySelector(".tit_view")?.text.trim() || root.querySelector(".subject")?.text.trim() || root.querySelector("title")?.text.trim() || "카카오 패치노트";

  let summaryOrError = "";
  try {
    const ajaxUrl = targetUrl.replace("/notice/read?", "/notice/ajax/read?");
    const detailRes = await fetch(ajaxUrl, { 
      cache: 'no-store', 
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Referer": targetUrl }
    });

    if (detailRes.ok) {
      const detailHTML = await detailRes.text();
      const detailRoot = parse(detailHTML);
      const realTitle = detailRoot.querySelector(".tit_view")?.text.trim();
      if (realTitle) title = realTitle;
      
      detailRoot.querySelectorAll('script, style, ins, .wrap_page, .view_btn').forEach(el => el.remove());
      const articleBody = detailRoot.querySelector(".board-view__area") || detailRoot.querySelector(".view_cont") || detailRoot;
      const contentText = articleBody.text.replace(/\s+/g, ' ').trim();
      
      summaryOrError = await summarizeText(contentText);
    } else {
      summaryOrError = `❌ 본문 데이터 수집 실패 (${detailRes.status})`;
    }
  } catch(e: any) {
    summaryOrError = `❌ 시스템 오류: ${e.message}`;
  }

  return { type: "kakao_patch_notes", title: `[카카오] ${title}`, fullUrl: targetUrl, summaryOrError };
}

export async function POST(request: Request) {
  try {
    const supabaseServer = await createClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return NextResponse.json({ error: "🔒 로그인이 필요합니다." }, { status: 401 });

    const { data: profile } = await supabaseServer.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") return NextResponse.json({ error: "⛔ 관리자 권한이 없습니다." }, { status: 403 });

    const { url } = await request.json();
    const manualUrl = url?.trim();
    const supabaseAdmin = createSupabaseAdminClient(supabaseUrl, supabaseServiceKey);
    const results: any[] = [];
    
    if (manualUrl) {
      if (manualUrl.includes("pubg.com")) {
        const res = await fetchOfficialPatchNote(supabaseAdmin, manualUrl);
        if (res) results.push(res);
      } else if (manualUrl.includes("daum.net") || manualUrl.includes("kakao.com")) {
        const res = await fetchKakaoPatchNote(supabaseAdmin, manualUrl);
        if (res) results.push(res);
      }
    } else {
      const res = await fetchOfficialPatchNote(supabaseAdmin);
      if (res) results.push(res);
    }

    if (results.length === 0) return NextResponse.json({ success: true, message: "이미 최신 상태입니다." });

    const postsToInsert = results.map(r => ({
      title: r.title,
      content: buildHtml(r.summaryOrError, r.fullUrl),
      author: 'BGMS 시스템',
      category: '패치노트',
      is_notice: true
    }));

    const { error: insertError } = await supabaseAdmin.from('posts').upsert(postsToInsert, { onConflict: 'title' });
    if (insertError) throw new Error(`데이터베이스 저장 중 오류: ${insertError.message}`);

    for (const r of results) {
      await supabaseAdmin.from("sync_history").upsert({ type: r.type, last_url: r.fullUrl, updated_at: new Date().toISOString() }, { onConflict: 'type' });
    }

    return NextResponse.json({ success: true, details: results.map(r => r.title) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function buildHtml(summaryOrError: string, fullUrl: string) {
  const isError = summaryOrError.startsWith("❌");
  return `
    <div class="patch-note-container">
      <div class="${isError ? 'bg-red-500/10 border-red-500/30' : 'bg-[#F2A900]/10 border-[#F2A900]/30'} border rounded-xl p-6 mb-8">
        <h3 class="flex items-center gap-2 ${isError ? 'text-red-500' : 'text-[#F2A900]'} font-black text-xl mb-4">
          ${isError ? '🚨 동기화 오류' : '🤖 AI 핵심 요약'}
        </h3>
        <div class="prose prose-invert max-w-none text-gray-200 leading-relaxed whitespace-pre-wrap">${summaryOrError}</div>
      </div>
      <div class="flex flex-col items-center justify-center p-8 bg-[#1a1a1a] rounded-xl border border-white/5">
        <p class="text-gray-400 text-sm mb-4">더 자세한 내용은 공식 원문에서 확인하실 수 있습니다.</p>
        <a href="${fullUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 px-8 py-3 bg-[#F2A900] text-black font-black rounded-lg hover:bg-[#cc8b00] transition-all transform active:scale-95 shadow-lg shadow-[#F2A900]/20">🔗 원문 보러가기</a>
      </div>
    </div>
  `;
}

