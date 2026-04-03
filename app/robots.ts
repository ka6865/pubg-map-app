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
    sitemap: 'https://bgmap.kr/sitemap.xml', // BGMAP.kr 도메인 반영
  };
}
