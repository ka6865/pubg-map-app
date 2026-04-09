import HomeClient from '@/app/HomeClient';
import { Metadata } from 'next';
import { getTabSeo, getBreadcrumbJsonLd } from '@/lib/seo-config';
import { JsonLdProps } from '@/types/seo';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://bgms.kr";

export async function generateMetadata({ params }: { params: Promise<{ mapId: string }> }): Promise<Metadata> {
  const { mapId } = await params;
  // 첫 글자 대문자화 (erangel -> Erangel)
  const formattedId = mapId.charAt(0).toUpperCase() + mapId.slice(1);
  return getTabSeo(formattedId);
}

export default async function MapPage({ params }: { params: Promise<{ mapId: string }> }) {
  const { mapId } = await params;
  const formattedId = mapId.charAt(0).toUpperCase() + mapId.slice(1);

  const jsonLd: JsonLdProps[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "BGMS",
      "url": baseUrl,
    },
    getBreadcrumbJsonLd([
      { name: "지도", item: "/" },
      { name: formattedId, item: `/maps/${mapId}` }
    ]) as JsonLdProps
  ];

  return <HomeClient jsonLd={jsonLd} initialMapId={formattedId} />;
}
