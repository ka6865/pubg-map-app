import { MetadataRoute } from 'next';
export const dynamic = 'force-static';
import { createClient } from '@supabase/supabase-js';

// 서버 사이드 전용 Supabase 클라이언트 생성
// 보안을 위해 SUPABASE_SERVICE_ROLE_KEY가 서버 환경 변수에 등록되어 있어야 합니다.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 사이트맵용 베이스 URL 설정 (trailing slash 제거 루틴 추가)
  let baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://bgms.kr';
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
  
  const lastModified = new Date();

  // 1. 기본 정적 메뉴들 (공식 문서 권장 형식)
  const staticRoutes = [
    '',
    '/?tab=Erangel',
    '/?tab=Miramar',
    '/?tab=Taego',
    '/?tab=Rondo',
    '/?tab=Vikendi',
    '/?tab=Deston',
    '/?tab=Stats',
    '/?tab=Board',
    '/weapons',
    '/backpack',
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified,
    changeFrequency: 'daily' as const,
    priority: route === '' ? 1 : 0.8,
  }));

  // 2. 개별 게시글들 (DB 실시간 동기화)
  let postRoutes: MetadataRoute.Sitemap = [];
  try {
    const { data: posts, error } = await supabase
      .from('posts')
      .select('id, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (posts) {
      postRoutes = posts.map((post) => ({
        url: `${baseUrl}/?tab=Board&amp;postId=${post.id}`,
        lastModified: post.created_at ? new Date(post.created_at) : lastModified,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }));
    }
  } catch (error) {
    console.error('[Sitemap Error] 게시글을 불러오지 못했습니다. 환경변수(SERVICE_ROLE_KEY)를 확인하세요.', error);
    // 에러 발생 시에도 빈 결과 대신 기본 메뉴는 반환합니다.
  }

  return [...staticRoutes, ...postRoutes];
}
