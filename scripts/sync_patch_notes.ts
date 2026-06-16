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
      "gemini-3.1-flash-lite",
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
    ];

    const prompt = `
당신은 PUBG(배틀그라운드) 전문 전략 분석가입니다. 
제공된 패치노트 원문(${title})을 읽고, 유저들이 게임 플레이 시 반드시 알아야 할 가장 핵심적인 변화들을 극도로 슬림하고 강렬하게 요약해 주세요.

[요약 제약 조건 - 절대 엄수]
1. 섹션(카테고리)은 반드시 **최대 3개에서 4개**까지만 도출하세요. (예: [신규 무기], [맵 업데이트], [시스템 개선] 등)
2. 각 섹션 하단에 작성하는 불렛포인트(-) 요약문은 **반드시 섹션당 최대 2개 이하**로 제한하세요.
3. 각 불렛포인트는 **반드시 15자 내외의 극도로 짧고 직관적인 핵심 1줄 요약**이어야 합니다. 상세 설명이나 중언부언은 과감히 생략하십시오.
4. 반드시 한국어로 작성하고, 가장 핵심적인 키워드만 **강조**해 주십시오.

예시 규격:
[신규 총기: MP9]
- 풀파츠급 성능의 신규 **SMG 무기** 출시.
- 기본 소음기 및 레이저 사이트 **자동 장착**.

[전술 장비 리밸런싱]
- 스포터 스코프의 탐색 거리 **100m 너프**.
- 전술 가방의 보관 슬롯 **2칸 축소**.

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

    // 6. 예쁘고 세련된 Tailwind 기반의 반응형 디자인 구성 (Tailwind v4 준수)
    const formattedContent = minifyHtml(`
      <div class="patch-note-container space-y-4">
        <div class="bg-[#F2A900]/10 border border-[#F2A900]/30 rounded-lg p-4 mb-1">
          <h3 class="flex items-center gap-1.5 text-[#F2A900] font-black text-base md:text-lg">
            🤖 BGMS AI 패치노트 핵심 요약
          </h3>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${formatAiSummaryToHtml(aiSummary)}
        </div>

        <div class="flex flex-col items-center justify-center p-6 bg-[#1a1a1a] rounded-lg border border-white/5">
          <p class="text-gray-400 text-xs mb-3">더 자세한 내용은 공식 원문에서 확인하실 수 있습니다.</p>
          <a href="${url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-6 py-2.5 bg-[#F2A900] text-black font-black text-sm rounded hover:bg-[#cc8b00] transition-all transform active:scale-95 shadow-md shadow-[#F2A900]/20">🔗 원문 보러가기</a>
        </div>
      </div>
    `);

    return formattedContent;
  } catch (error) {
    console.error('fetchPatchNoteDetail error:', error);
    return null;
  }
}

/**
 * HTML 문자열의 모든 줄바꿈과 불필요한 연속 공백을 압축(minify)하여 white-space: pre-wrap 오작동을 영구 방지하는 헬퍼 함수
 */
function minifyHtml(html: string): string {
  return html
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
}

function formatAiSummaryToHtml(summary: string): string {
  if (!summary) return "";
  
  // 1. 만약 대괄호 [섹션] 형태가 없고, "* **제목**:" 또는 "- **제목**:" 형태의 목록이 존재한다면,
  // 이를 대괄호 [섹션] 형태로 전처리하여 쪼개기 쉽게 만듭니다.
  let processed = summary;
  if (!summary.includes('[') || !summary.includes(']')) {
    processed = summary.replace(/[*•-]\s*\*\*(.*?)\*\*[:\s]*/g, '\n[$1]\n- ');
  }

  // 만약 카테고리 표기법([섹션])이 여전히 존재하지 않는 단순 텍스트인 경우 줄바꿈만 치환하여 반환
  if (!processed.includes('[') || !processed.includes(']')) {
    return minifyHtml(`
      <div class="bg-[#1a1a1a] border border-white/5 rounded-lg p-4 text-gray-300 text-sm leading-relaxed">
        ${processed.replace(/\n/g, '<br/>')}
      </div>
    `);
  }

  // [카테고리] 단위로 정밀하게 split
  const sections = processed.split(/(?=\[.*?\])/g);
  
  const cardsHtml = sections.map(section => {
    const titleMatch = section.match(/\[(.*?)\]/);
    if (!titleMatch) return "";
    
    const title = titleMatch[1].trim();
    const content = section.replace(`[${titleMatch[1]}]`, "").trim();
    
    // 카테고리 텍스트에 어울리는 최적의 매치 이모지 지정
    let emoji = "🔹";
    if (title.includes("신규") || title.includes("새로운")) emoji = "🆕";
    else if (title.includes("밸런스") || title.includes("조정") || title.includes("너프") || title.includes("버프")) emoji = "⚖️";
    else if (title.includes("시스템") || title.includes("편의성") || title.includes("개선") || title.includes("UI") || title.includes("UX")) emoji = "⚙️";
    else if (title.includes("수정") || title.includes("해결") || title.includes("버그")) emoji = "🛠️";
    else if (title.includes("맵") || title.includes("지형") || title.includes("월드")) emoji = "🗺️";
    else if (title.includes("무기") || title.includes("아이템")) emoji = "🔫";

    // 본문 줄바꿈 및 리스트 아이템 정밀 파싱
    const items = content.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 2)
      .map(line => {
        // 기존의 불렛 마커(-, *, • 등)를 말끔하게 제거하고 텍스트 정규화
        const text = line.replace(/^[-*•\s]+/, "").trim();
        // 볼드 처리(**텍스트**)를 Tailwind 스타일이 적용된 강조용 strong 태그로 치환
        const highlighted = text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-[#F2A900] font-black">$1</strong>');
        
        return `
          <li class="relative pl-4 text-gray-300 text-xs md:text-sm leading-normal mb-1.5 list-none">
            <span class="absolute left-0 top-0 text-[#F2A900] font-bold">✓</span>
            ${highlighted}
          </li>
        `;
      }).join("");

    if (!items) return "";

    return `
      <div class="bg-[#1a1a1a] border border-white/5 rounded-lg p-4 shadow-md transition-all hover:border-white/10 hover:shadow-lg">
        <div class="text-[#F2A900] text-sm md:text-base font-black mb-2 flex items-center gap-1.5 border-b border-white/5 pb-1.5">
          <span>${emoji}</span> ${title}
        </div>
        <ul class="space-y-1 m-0 p-0">${items}</ul>
      </div>
    `;
  }).join("");

  return minifyHtml(cardsHtml);
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

    // 기존에 동일한 제목의 글이 있는지 확인
    const { data: existingPost } = await supabase
      .from('posts')
      .select('id')
      .eq('title', cleanTitle)
      .maybeSingle();

    // 기존 패치노트 공지사항 상태 일괄 해제 (최신 1건만 공지 유지)
    console.log('📝 기존 패치노트 공지 플래그를 일괄 해제합니다.');
    await supabase
      .from('posts')
      .update({ is_notice: false })
      .eq('category', '패치노트')
      .eq('is_notice', true);

    let dbResult;
    if (existingPost) {
      console.log(`📝 기존 패치노트 글(ID: ${existingPost.id})이 발견되어 업데이트합니다.`);
      dbResult = await supabase.from('posts').update({
        content: formattedContent,
        author: 'BGMS 시스템',
        category: '패치노트',
        is_notice: true,
        image_url: thumbnailUrl
      }).eq('id', existingPost.id);
    } else {
      console.log('📝 신규 패치노트 글을 등록합니다.');
      dbResult = await supabase.from('posts').insert({
        title: cleanTitle,
        content: formattedContent,
        author: 'BGMS 시스템',
        category: '패치노트',
        is_notice: true,
        image_url: thumbnailUrl
      });
    }

    const { error: dbError } = dbResult;

    if (dbError) {
      console.error('❌ Failed to save post to database:', dbError);
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
