import HomeClient from './HomeClient';
import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';

// 서버 전용 Supabase 클라이언트 (메타데이터 조회용)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://bgms.kr";

// [SEO] 동적 메타데이터 생성 함수
export async function generateMetadata({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }): Promise<Metadata> {
  const postId = searchParams.postId as string;
  const tab = (searchParams.tab as string) || "Erangel";

  // 1. 게시글 상세 페이지 메타데이터
  if (postId) {
    try {
      const { data: post } = await supabase
        .from('posts')
        .select('id, title, content, category, author, created_at, updated_at, image_url')
        .eq('id', postId)
        .single();

      if (post) {
        const plainText = post.content?.replace(/<[^>]*>/g, '').substring(0, 150) || '';
        const canonicalUrl = `${baseUrl}/?tab=Board&postId=${postId}`;
        
        return {
          title: `${post.title} | ${post.category} - BGMS`,
          description: plainText,
          alternates: { canonical: canonicalUrl },
          openGraph: {
            title: `${post.title} - BGMS`,
            description: plainText,
            url: canonicalUrl,
            type: 'article',
            publishedTime: post.created_at,
            modifiedTime: post.updated_at,
            authors: [post.author],
            images: [post.image_url || `${baseUrl}/logo.png`],
          },
          twitter: {
            card: 'summary_large_image',
            title: `${post.title} - BGMS`,
            description: plainText,
            images: [post.image_url || `${baseUrl}/logo.png`],
          }
        };
      }
    } catch (e) {
      console.error('Metadata generation error:', e);
    }
  }

  // 2. 맵/탭별 맞춤형 메타데이터 (ID 기반)
  const tabMetadata: Record<string, { title: string; desc: string }> = {
    Erangel: { title: "에란겔(Erangel) 차량 위치 및 전략 지도", desc: "배틀그라운드 에란겔 맵의 모든 차량/보트 스폰 위치와 고정 차량 정보, 꿀집 위치를 확인하세요." },
    Miramar: { title: "미라마(Miramar) 차량 위치 및 전략 지도", desc: "황금 미라도 위치부터 오프로드 주행 경로, 미라마 전술 지도를 BGMS에서 제공합니다." },
    Taego: { title: "태이고(Taego) 차량 위치 및 전략 지도", desc: "태이고 차고지 위치, 포터 스폰 장소, 비밀방 위치 정보를 한눈에 확인하세요." },
    Rondo: { title: "론도(Rondo) 차량 위치 및 전략 지도", desc: "론도의 넓은 지형을 극복하기 위한 모든 이동수단 스폰 위치 정보를 제공합니다." },
    Vikendi: { title: "비켄디(Vikendi) 차량 위치 및 전략 지도", desc: "비켄디 리본 맵의 차량 위치와 스노우모빌 정보를 확인하세요." },
    Deston: { title: "데스턴(Deston) 차량 위치 및 전략 지도", desc: "데스턴 경찰차, 에어보트 위치와 주요 건물 파밍 루트를 제공합니다." },
    Stats: { title: "배그 전적 검색 및 실시간 딜량 계산기", desc: "배틀그라운드 시즌별 전적과 평균 딜량, 킬뎃 정보를 즉시 조회하세요." },
    Board: { title: "생존자 커뮤니티 및 최신 패치노트", desc: "배틀그라운드 최신 업데이트 소식과 유저들의 전략을 공유하는 공간입니다." }
  };

  const currentMeta = tabMetadata[tab] || { 
    title: "배틀그라운드 통합 지도 및 전략 서비스", 
    desc: "모든 맵의 차량 위치와 실시간 전적, 아이템 무게 계산기를 제공하는 전문 전술 플랫폼입니다." 
  };

  return {
    title: `${currentMeta.title} | BGMS`,
    description: currentMeta.desc,
    alternates: { canonical: tab === "Erangel" ? "/" : `/?tab=${tab}` },
    openGraph: {
      title: `${currentMeta.title} - BGMS`,
      description: currentMeta.desc,
      url: tab === "Erangel" ? "/" : `/?tab=${tab}`,
      images: [`${baseUrl}/logo.png`],
    }
  };
}

// 메인 페이지 서버 컴포넌트
export default async function Home({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const activeMapId = (searchParams.tab as string) || "Erangel";
  const preloadMaps = ["Erangel", "Miramar", "Taego", "Rondo", "Vikendi", "Deston"];

  const jsonLd: any[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "BGMS",
      "url": baseUrl,
      "potentialAction": {
        "@type": "SearchAction",
        "target": `${baseUrl}/?q={search_term_string}`,
        "query-input": "required name=search_term_string"
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "에란겔", "item": `${baseUrl}/?tab=Erangel` },
        { "@type": "ListItem", "position": 2, "name": "미라마", "item": `${baseUrl}/?tab=Miramar` },
        { "@type": "ListItem", "position": 3, "name": "태이고", "item": `${baseUrl}/?tab=Taego` },
        { "@type": "ListItem", "position": 4, "name": "게시판", "item": `${baseUrl}/?tab=Board` }
      ]
    }
  ];

  if (searchParams.postId) {
    try {
      const postId = searchParams.postId as string;
      const { data: post } = await supabase
        .from('posts')
        .select('title, content, author, created_at, updated_at, image_url, category')
        .eq('id', postId)
        .single();

      if (post) {
        jsonLd.push({
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": post.title,
          "description": post.content?.replace(/<[^>]*>/g, '').substring(0, 150),
          "author": { "@type": "Person", "name": post.author },
          "datePublished": post.created_at,
          "dateModified": post.updated_at,
          "publisher": {
            "@type": "Organization",
            "name": "BGMS",
            "logo": { "@type": "ImageObject", "url": `${baseUrl}/logo.png` }
          },
          "image": post.image_url || `${baseUrl}/logo.png`,
          "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": `${baseUrl}/?tab=Board&postId=${postId}`
          }
        });
      }
    } catch (e) {
      console.error('JsonLd article error:', e);
    }
  }

  return (
    <>
      <link rel="preload" href={`/${activeMapId}.jpg`} as="image" />
      {preloadMaps.filter(m => m !== activeMapId).map(m => (
        <link key={m} rel="prefetch" href={`/${m}.jpg`} as="image" />
      ))}
      <HomeClient jsonLd={jsonLd} />
    </>
  );
}
