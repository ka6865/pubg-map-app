import HomeClient from '../HomeClient';
import { Metadata } from 'next';
import { getTabSeo, getBreadcrumbJsonLd } from '@/lib/seo-config';
import { JsonLdProps } from '@/types/seo';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://bgms.kr";

export async function generateMetadata(): Promise<Metadata> {
  return getTabSeo("Stats");
}

export default async function StatsPage() {
  const jsonLd: JsonLdProps[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "BGMS",
      "url": baseUrl,
    },
    getBreadcrumbJsonLd([
      { name: "홈", item: "/" },
      { name: "전적 검색", item: "/stats" }
    ]) as JsonLdProps
  ];

  return <HomeClient jsonLd={jsonLd} initialMapId="Stats" />;
}
