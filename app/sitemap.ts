import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://bgmap.kr'; // BGMAP.kr 도메인 반영
  const lastModified = new Date();

  // 기본 페이지들
  const routes = [
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
    url: `${baseUrl}${route ? '/' + route : ''}`,
    lastModified,
    changeFrequency: 'daily' as const,
    priority: route === '' ? 1 : 0.8,
  }));

  return routes;
}
