import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

// 서버 사이드 전용 Supabase 클라이언트 생성 (서비스 롤 키 사용하여 모든 글 조회 가능)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://bgms.kr';
  const lastModified = new Date();

  // 1. 기본 정적 페이지들
  const staticRoutes = [
    '',
    '?tab=Erangel',
    '?tab=Miramar',
    '?tab=Taego',
    '?tab=Rondo',
    '?tab=Vikendi',
    '?tab=Deston',
    '?tab=Stats',
    '?tab=Board',
    'weapons',
    'backpack',
  ].map((route) => ({
    url: route ? `${baseUrl}/${route}` : baseUrl,
    lastModified,
    changeFrequency: 'daily' as const,
    priority: route === '' ? 1 : 0.8,
  }));

  // 2. 게시판 개별 게시글들 (DB에서 동적으로 가져오기)
  let postRoutes: MetadataRoute.Sitemap = [];
  try {
    const { data: posts } = await supabase
      .from('posts')
      .select('id, updated_at')
      .order('updated_at', { ascending: false });

    if (posts) {
      postRoutes = posts.map((post) => ({
        url: `${baseUrl}/?tab=Board&postId=${post.id}`,
        lastModified: new Date(post.updated_at),
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }));
    }
  } catch (error) {
    console.error('Sitemap post fetch error:', error);
  }

  return [...staticRoutes, ...postRoutes];
}
