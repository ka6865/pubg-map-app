import { MetadataRoute } from 'next';

/**
 * [V2] 사이트맵 최적화: 빌드 타임아웃 방지를 위해 정적 경로 위주로 구성
 */
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

  return [...staticEntries, ...mapEntries];
}
