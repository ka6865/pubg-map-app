import axios from 'axios';
import { parse } from 'node-html-parser';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

// .env.local 파일 로드
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY!;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * 패치노트 상세 페이지 크롤링 및 요약
 */
async function fetchPatchNoteDetail(url: string, title: string) {
  try {
    const { data: html } = await axios.get(url);
    const root = parse(html);

    // 공식 홈페이지 구조 분석 기반 선택자
    const contentElement = root.querySelector('.content-template__inner') || root.querySelector('#contentElement') || root.querySelector('article');
    const rawText = contentElement?.text || "";

    // 텍스트 정제
    const cleanText = rawText
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 15000);

    console.log(`📝 Extracted content length: ${cleanText.length}`);

    // [규칙 준수] 모델 풀백 순서: 3.1 flash lite -> 3 flash -> 1.5 flash
    if (!GEMINI_API_KEY) {
      console.warn('⚠️ GOOGLE_GEMINI_API_KEY가 설정되지 않아 AI 요약을 건너뜁니다.');
      return null;
    }

    // [규칙 준수] 모델 풀백 순서: 최신 안정 모델 우선
    const geminiModels = [
      "gemini-3.1-flash-lite-preview",
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
    ];

    const prompt = `
당신은 PUBG(배틀그라운드) 전문 전략 분석가입니다. 
제공된 패치노트 원문(${title})을 읽고, 유저들이 가장 궁금해할 핵심 내용을 요약해 주세요.

[중요 지침]
- 반드시 제공된 원문 내용에만 기반하여 요약하세요. 
- 과거 패치 데이터(드론 제어기 등)가 텍스트에 포함되어 있더라도 무시하고, 제목(${title})에 해당하는 최신 정보만 추출하세요.
- 각 섹션 제목은 반드시 [섹션명] 형식으로 작성하세요.

[출력 규칙]
1. 반드시 한국어로 답변해줘.
2. 각 섹션 제목은 [섹션명] 형식으로 작성해줘.
3. 각 카테고리 하단에 핵심 내용을 불렛포인트(-)로 작성해줘.
4. 중요한 키워드는 **강조**해줘.

패치노트 원문:
${cleanText}`;

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    let aiSummary = "";

    for (const modelId of geminiModels) {
      try {
        console.log(`🤖 Attempting summary with ${modelId}...`);
        const model = genAI.getGenerativeModel({ model: modelId });
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        if (text && text.length > 50 && !text.includes("본문을 입력")) {
          aiSummary = text;
          console.log(`✅ Summary generated with ${modelId}`);
          break;
        }
      } catch (err) {
        console.warn(`⚠️ ${modelId} failed:`, err instanceof Error ? err.message : err);
      }
    }

    if (!aiSummary) aiSummary = "이번 패치노트의 주요 내용을 분석 중입니다. 상세한 내용은 아래 원문 링크를 통해 확인해 주세요.";

    console.log('--- AI SUMMARY START ---');
    console.log(aiSummary);
    console.log('--- AI SUMMARY END ---');

    const aiSummaryHtml = formatAiSummaryToHtml(aiSummary);

    // 너비 확장: 100% 가득 채움
    const formattedContent = `
      <div style="width:100%!important;margin:0 auto!important;font-family:'Pretendard',sans-serif;background:#141414;border:1px solid #333;border-radius:4px;overflow:hidden;display:block!important;padding:0!important;line-height:1.2!important;">
        <div style="background:#222;padding:4px 8px!important;border-bottom:1px solid #333;display:block!important;margin:0!important;">
          <span style="color:#F2A900!important;font-size:12px!important;font-weight:900!important;display:inline-block!important;">🤖 BGMS AI 요약 브리핑</span>
        </div>
        <div style="padding:4px!important;display:block!important;margin:0!important;">
          ${aiSummaryHtml}
        </div>
        <div style="padding:6px!important;text-align:center!important;display:block!important;margin:0!important;border-top:1px solid #222;">
          <a href="${url}" target="_blank" style="display:inline-block!important;padding:4px 12px!important;background:#F2A900!important;color:#000!important;font-weight:900!important;font-size:11px!important;text-decoration:none!important;border-radius:2px!important;">🔗 공식 패치노트 원문 보기</a>
        </div>
      </div>
    `.replace(/>\s+</g, "><").replace(/\n/g, "").trim();

    return formattedContent;
  } catch (error) {
    console.error('fetchPatchNoteDetail error:', error);
    return null;
  }
}

function formatAiSummaryToHtml(summary: string): string {
  if (!summary) return "";

  if (!summary.includes('[') || !summary.includes(']')) {
    return `<div style="color:#bbb;font-size:12px;padding:4px;">${summary.replace(/\n/g, '<br/>')}</div>`;
  }

  const sections = summary.split(/(?=\[.*?\])/g);

  const formatted = sections.map(section => {
    const titleMatch = section.match(/\[(.*?)\]/);
    if (!titleMatch) return "";

    const title = titleMatch[1];
    const content = section.replace(`[${title}]`, "").trim();

    let emoji = "🔹";
    if (title.includes("신규")) emoji = "🆕";
    else if (title.includes("밸런스")) emoji = "⚖️";
    else if (title.includes("시스템") || title.includes("편의성")) emoji = "⚙️";

    const items = content.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 5)
      .map(line => {
        const text = line.replace(/^[^a-zA-Z0-9가-힣]+/, "").trim();
        const highlighted = text.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#F2A900!important;">$1</strong>');
        return `<div style="display:block!important;margin:0 0 1px 0!important;padding:0 0 0 10px!important;position:relative!important;font-size:12px!important;color:#bbb!important;line-height:1.2!important;text-indent:-10px!important;">• ${highlighted}</div>`;
      }).join("");

    if (!items) return "";

    return `
      <div style="display:block!important;margin:0 0 6px 0!important;padding:4px!important;background:rgba(255,255,255,0.02);border-radius:2px!important;border:1px solid rgba(255,255,255,0.03)!important;">
        <div style="color:#F2A900!important;font-size:12px!important;font-weight:900!important;margin:0 0 3px 0!important;display:block!important;">${emoji} ${title}</div>
        ${items}
      </div>
    `;
  }).join("");

  return formatted || `<div style="color:#bbb;font-size:12px;padding:4px;">${summary.replace(/\n/g, '<br/>')}</div>`;
}

async function syncPatchNotes() {
  console.log('🚀 Starting Patch Notes Sync...');
  try {
    const targetUrl = 'https://pubg.com/ko/news';
    const { data: html } = await axios.get(targetUrl);

    // 썸네일 이미지 URL 추출 로직 개선 (thumbUrl 추출)
    const nuxtRegex = /postId:(\d+),(?:(?!postId:).)*?title:"([^"]*?패치 노트[^"]*?)".*?thumbUrl:"([^"]+)"/g;
    let match;
    const matches: any[] = [];
    while ((match = nuxtRegex.exec(html)) !== null) {
      matches.push({ id: match[1], title: match[2], thumbnail: match[3].replace(/\\u002F/g, '/') });
    }

    if (matches.length === 0) {
      console.log('✅ No patch notes found.');
      return;
    }

    const latestPatch = matches[0];
    const fullUrl = `https://pubg.com/ko/news/${latestPatch.id}`;
    const cleanTitle = latestPatch.title.normalize('NFC').trim();
    const thumbnailUrl = latestPatch.thumbnail;

    // 중복 체크: 이미 동기화된 URL인지 확인
    const { data: history } = await supabase
      .from('sync_history')
      .select('last_url')
      .eq('type', 'patch_notes')
      .eq('last_url', fullUrl)
      .single();

    if (history) {
      console.log('✅ 이미 최신 패치노트가 동기화되어 있습니다. 작업을 종료합니다.');
      return;
    }

    console.log(`🔍 New Patch Note found: ${cleanTitle} (ID: ${latestPatch.id})`);
    console.log(`🖼️ Thumbnail URL: ${thumbnailUrl}`);

    const formattedContent = await fetchPatchNoteDetail(fullUrl, cleanTitle);
    if (!formattedContent) {
      console.error('❌ Failed to fetch patch note detail.');
      return;
    }

    const { error: upsertError } = await supabase.from('posts').upsert({
      title: cleanTitle,
      content: formattedContent,
      author: 'BGMS 시스템',
      category: '패치노트',
      is_notice: true,
      image_url: thumbnailUrl // thumbnail_url 대신 image_url 사용
    }, { onConflict: 'title' });

    if (upsertError) {
      console.error('❌ Failed to upsert post:', upsertError);
      return;
    }

    await supabase.from('sync_history').upsert({ type: 'patch_notes', last_url: fullUrl });
    console.log('✅ Sync successful.');

    if (DISCORD_WEBHOOK_URL) {
      console.log('🔔 Sending Discord Notification...');
      await axios.post(DISCORD_WEBHOOK_URL, {
        content: `🆕 **새로운 패치노트가 업데이트되었습니다!**\n\n제목: ${cleanTitle}\n링크: ${SITE_URL}/board\n\n*BGMS AI가 요약을 완료하여 게시판에 등록했습니다.*`
      }).catch(err => console.error('❌ Discord notification failed:', err.message));
    }
  } catch (error) {
    console.error('❌ syncPatchNotes error:', error);
  }
}

syncPatchNotes();
