import { MetadataRoute } from 'next';
export const revalidate = 3600; // 1시간마다 사이트맵 갱신 (자동 수집 최적화)
import { createClient } from '@supabase/supabase-js';

// 🌟 [보안/안정성] 서버 사이드 전용 Supabase 클라이언트 생성 (URL/Key 유효성 검사 추가)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 사이트맵용 베이스 URL 설정
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

  // 🌟 [확장] 게시글들 가져오기 (최신 1,000개까지 수집 범위 확대)
  let postEntries: MetadataRoute.Sitemap = [];
  if (supabase) {
    try {
      const { data: posts, error } = await supabase
        .from('posts')
        .select('id, created_at')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (!error && posts) {
        postEntries = posts.map((post) => ({
          url: `${siteUrl}/board/${post.id}`,
          lastModified: post.created_at ? new Date(post.created_at) : new Date(),
          changeFrequency: 'weekly',
          priority: 0.6,
        }));
      }
    } catch (error) {
      console.error('[Sitemap Error] 게시글 로드 실패:', error);
    }
  }

  return [...staticEntries, ...mapEntries, ...postEntries];
}
