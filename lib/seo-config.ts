import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { BreadcrumbList, ArticleSchema } from '@/types/seo';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://bgms.kr";

export const tabMetadata: Record<string, { title: string; desc: string }> = {
  Erangel: { title: "에란겔(Erangel) 고젠 위치 및 전술 지도", desc: "배그 에란겔 맵의 모든 고정 젠(고젠) 차량/보트 스폰 위치 정보를 BGMS에서 확인하세요." },
  Miramar: { title: "미라마(Miramar) 고젠 위치 및 전술 지도", desc: "미라마 맵의 고정 차량(고젠) 스폰 지역과 황금 미라도 위치 등 핵심 정보를 제공합니다." },
  Taego: { title: "태이고(Taego) 고젠 위치 및 전술 지도", desc: "태이고 맵의 고정 탈것(고젠) 장소와 포터, 비밀방 상세 위치를 확인하세요." },
  Rondo: { title: "론도(Rondo) 고젠 위치 및 전술 지도", desc: "론도 맵의 넓은 지형을 빠르게 이동할 수 있는 고정 젠 차량 위치 정보를 확인하세요." },
  Vikendi: { title: "비켄디(Vikendi) 고젠 위치 및 전술 지도", desc: "비켄디 리본 맵의 고정 차량 스폰(고젠) 위치와 스노우모빌 정보를 제공합니다." },
  Deston: { title: "데스턴(Deston) 고젠 위치 및 전술 지도", desc: "데스턴의 고정 젠 차량 및 에어보트 위치와 주요 파밍 루트를 확인하세요." },
  Stats: { title: "배그 전적 검색 및 실시간 딜량 계산기", desc: "배틀그라운드 시즌별 전적과 평균 딜량, 킬뎃 정보를 즉시 조회하세요." },
  Board: { title: "생존자 커뮤니티 및 고젠 공략 게시판", desc: "배틀그라운드 최신 업데이트 소식과 유저들의 고젠 공략을 공유하는 공간입니다." }
};

export async function getPostMetadata(postId: string): Promise<Metadata | null> {
  try {
    const { data: post } = await supabase
      .from('posts')
      .select('id, title, content, category, author, created_at, updated_at, image_url')
      .eq('id', postId)
      .single();

    if (post) {
      const plainText = post.content?.replace(/<[^>]*>/g, '').substring(0, 150) || '';
      const canonicalUrl = `${baseUrl}/board/${postId}`;
      
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
    console.error('getPostMetadata error:', e);
  }
  return null;
}

export function getTabSeo(tab: string): Metadata {
  const currentMeta = tabMetadata[tab] || { 
    title: "배틀그라운드 통합 지도 및 전략 서비스", 
    desc: "모든 맵의 차량 위치와 실시간 전적, 아이템 무게 계산기를 제공하는 전문 전술 플랫폼입니다." 
  };

  const path = tab === "Erangel" ? "" : 
               tab === "Board" ? "board" : 
               tab === "Stats" ? "stats" : 
               `maps/${tab.toLowerCase()}`;

  const canonicalUrl = `${baseUrl}/${path}`;

  return {
    title: `${currentMeta.title} | BGMS`,
    description: currentMeta.desc,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: `${currentMeta.title} - BGMS`,
      description: currentMeta.desc,
      url: canonicalUrl,
      images: [
        ["Erangel", "Miramar", "Taego", "Rondo", "Vikendi", "Deston"].includes(tab)
          ? `${baseUrl}/tiles/${tab}/0/0/-1.jpg`
          : `${baseUrl}/logo.png`,
      ],
    }
  };
}

/**
 * 브레드크럼(Breadcrumb) JSON-LD를 생성합니다.
 */
export function getBreadcrumbJsonLd(items: { name: string; item: string }[]): BreadcrumbList {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.item.startsWith('http') ? item.item : `${baseUrl}${item.item.startsWith('/') ? '' : '/'}${item.item}`,
    })),
  };
}

/**
 * 게시글 상세용 Article JSON-LD를 생성합니다.
 */
export async function getPostArticleJsonLd(postId: string): Promise<ArticleSchema | null> {
  try {
    const { data: post } = await supabase
      .from('posts')
      .select('id, title, content, author, created_at, updated_at, image_url, category')
      .eq('id', postId)
      .single();

    if (post) {
      const plainText = post.content?.replace(/<[^>]*>/g, '').substring(0, 150) || '';
      return {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: post.title,
        description: plainText,
        image: post.image_url || `${baseUrl}/logo.png`,
        datePublished: post.created_at,
        dateModified: post.updated_at || post.created_at,
        author: {
          "@type": "Person",
          name: post.author,
        },
        publisher: {
          "@type": "Organization",
          name: "BGMS",
          logo: {
            "@type": "ImageObject",
            url: `${baseUrl}/logo.png`,
          },
        },
      };
    }
  } catch (e) {
    console.error('getPostArticleJsonLd error:', e);
  }
  return null;
}
