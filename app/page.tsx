import HomeClient from './HomeClient';
import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';

// 서버 전용 Supabase 클라이언트 (메타데이터 조회용)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// [SEO] 동적 메타데이터 생성 함수
export async function generateMetadata({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }): Promise<Metadata> {
  const postId = searchParams.postId as string;

  if (postId) {
    try {
      const { data: post } = await supabase
        .from('posts')
        .select('id, title, content, category, author, created_at, updated_at, image_url')
        .eq('id', postId)
        .single();

      if (post) {
        // 본문에서 텍스트만 추출하여 150자 내외로 설명문 생성
        const plainText = post.content?.replace(/<[^>]*>/g, '').substring(0, 150) || '';
        const canonicalUrl = `https://bgms.kr/?tab=Board&postId=${postId}`;
        
        return {
          title: `${post.title} | ${post.category} - BGMS`,
          description: plainText,
          alternates: {
            canonical: canonicalUrl,
          },
          openGraph: {
            title: `${post.title} - BGMS`,
            description: plainText,
            url: canonicalUrl,
            type: 'article',
            publishedTime: post.created_at,
            modifiedTime: post.updated_at,
            authors: [post.author],
            images: [post.image_url || '/logo.png'],
          },
          twitter: {
            card: 'summary_large_image',
            title: `${post.title} - BGMS`,
            description: plainText,
            images: [post.image_url || '/logo.png'],
          }
        };
      }
    } catch (e) {
      console.error('Metadata generation error:', e);
    }
  }

  return {
    title: 'BGMS | 배틀그라운드 통합 지도 서비스 - 차량 및 전술 정보',
    description: '에란겔, 미라마, 태이고 등 배틀그라운드 모든 맵의 차량/보트 위치와 실시간 전적 정보를 제공하는 전문 전술 플랫폼 BGMS입니다.'
  };
}

// 메인 페이지 서버 컴포넌트
export default async function Home({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const activeMapId = searchParams.tab as string || "Erangel";
  
  // 맵 이미지 프리로딩 리스트 (대표 3종)
  const preloadMaps = ["Erangel", "Miramar", "Taego", "Rondo", "Vikendi", "Deston"];

  const jsonLd: any[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "BGMS",
      "url": "https://bgms.kr",
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://bgms.kr/?q={search_term_string}",
        "query-input": "required name=search_term_string"
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "BGMS - 배틀그라운드 통합 전술 지도",
      "description": "에란겔, 미라마, 태이고 론도 등 배틀그라운드 모든 맵의 차량 스폰 위치 및 텔레메트리 정보를 제공하는 전문 전술 플랫폼입니다.",
      "applicationCategory": "GameApplication",
      "operatingSystem": "Web",
      "author": {
        "@type": "Organization",
        "name": "BGMS Team",
        "url": "https://bgms.kr"
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "에란겔",
          "item": "https://bgms.kr/?tab=Erangel"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "미라마",
          "item": "https://bgms.kr/?tab=Miramar"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "태이고",
          "item": "https://bgms.kr/?tab=Taego"
        },
        {
          "@type": "ListItem",
          "position": 4,
          "name": "게시판",
          "item": "https://bgms.kr/?tab=Board"
        }
      ]
    }
  ];

  // 게시글 상세 페이지일 경우 Article 스키마 추가
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
          "author": {
            "@type": "Person",
            "name": post.author
          },
          "datePublished": post.created_at,
          "dateModified": post.updated_at,
          "publisher": {
            "@type": "Organization",
            "name": "BGMS",
            "logo": {
              "@type": "ImageObject",
              "url": "https://bgms.kr/logo.png"
            }
          },
          "image": post.image_url || "https://bgms.kr/logo.png",
          "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": `https://bgms.kr/?tab=Board&postId=${postId}`
          }
        });
      }
    } catch (e) {
      console.error('JsonLd article error:', e);
    }
  }

  return (
    <>
      {/* 🚀 중요 리소스 프리로딩 (성능 최적화) */}
      <link rel="preload" href={`/${activeMapId}.jpg`} as="image" />
      {preloadMaps.filter(m => m !== activeMapId).map(m => (
        <link key={m} rel="prefetch" href={`/${m}.jpg`} as="image" />
      ))}
      
      <HomeClient jsonLd={jsonLd} />
    </>
  );
}