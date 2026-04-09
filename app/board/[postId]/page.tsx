import HomeClient from '@/app/HomeClient';
import { Metadata } from 'next';
import { getPostMetadata, getBreadcrumbJsonLd, getPostArticleJsonLd } from '@/lib/seo-config';
import { JsonLdProps } from '@/types/seo';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://bgms.kr";

export async function generateMetadata({ params }: { params: Promise<{ postId: string }> }): Promise<Metadata> {
  const { postId } = await params;
  const metadata = await getPostMetadata(postId);
  
  if (!metadata) {
    return {
      title: "게시글을 찾을 수 없습니다 | BGMS",
      robots: { index: false }
    };
  }
  
  return metadata;
}

export default async function PostDetailPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const metadata = await getPostMetadata(postId);
  
  const jsonLd: JsonLdProps[] = [
    getBreadcrumbJsonLd([
      { name: "커뮤니티", item: "/board" },
      { name: metadata?.title?.toString() || "게시글", item: `/board/${postId}` }
    ]) as JsonLdProps
  ];

  const articleJsonLd = await getPostArticleJsonLd(postId);
  if (articleJsonLd) {
    jsonLd.push(articleJsonLd as JsonLdProps);
  }

  // postId가 주입되면 기존 Board 컴포넌트 내부에서 이를 인식하도록 Map에 전달
  // (HomeClient -> Map -> Board 순서로 전달됨)
  return <HomeClient jsonLd={jsonLd} initialMapId="Board" postId={postId} />;
}
