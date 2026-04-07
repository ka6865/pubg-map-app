import { MetadataRoute } from 'next';

export const dynamic = 'force-static';

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
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://bgms.kr'}/sitemap.xml`,
  };
}
