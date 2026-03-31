import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/login',
        '/map-editor',
        '/api',
      ],
    },
    sitemap: 'https://pubg-map.app/sitemap.xml', // 본인 도메인이 생기면 변경 권장
  };
}
