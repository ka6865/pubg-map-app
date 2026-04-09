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
  let siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://bgms.kr';
  if (siteUrl.endsWith('/')) siteUrl = siteUrl.slice(0, -1);

  const maps = ["erangel", "miramar", "taego", "rondo", "vikendi", "deston"];
  const mapEntries: MetadataRoute.Sitemap = maps.map((map) => ({
    url: `${siteUrl}/maps/${map}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${siteUrl}/board`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${siteUrl}/stats`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.6,
    },
    {
      url: `${siteUrl}/weapons`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.5,
    },
    {
      url: `${siteUrl}/backpack`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.5,
    },
  ];

  // 🌟 게시글들 가져오기 (상세 페이지 SEO용)
  let postEntries: MetadataRoute.Sitemap = [];
  try {
    const { data: posts, error } = await supabase
      .from('posts')
      .select('id, updated_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    if (posts) {
      postEntries = posts.map((post) => ({
        url: `${siteUrl}/board/${post.id}`,
        lastModified: post.updated_at ? new Date(post.updated_at) : new Date(),
        changeFrequency: 'weekly',
        priority: 0.6,
      }));
    }
  } catch (error) {
    console.error('[Sitemap Error] 게시글을 불러오지 못했습니다. 환경변수(SERVICE_ROLE_KEY)를 확인하세요.', error);
  }

  return [...staticEntries, ...mapEntries, ...postEntries];
}
