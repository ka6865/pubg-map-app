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
    sitemap: 'https://bgms.kr/sitemap.xml', // BGMS 도메인 유지
  };
}
