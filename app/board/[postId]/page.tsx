import { Metadata } from 'next';
import { supabase } from '@/lib/supabase';
import { getPostMetadata, getBreadcrumbJsonLd, getPostArticleJsonLd } from '@/lib/seo-config';
import { JsonLdProps } from '@/types/seo';
import BoardDetailClient from '@/components/board/BoardDetailClient';

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

  const { data: postResult } = await supabase
    .from("posts")
    .select("*")
    .eq("id", postId)
    .single();

  const { data: commentResult } = await supabase
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (!postResult) {
    return (
      <div className="w-full h-full overflow-y-auto bg-[#121212] flex flex-col pt-6 items-center">
         <h1 className="text-2xl font-black text-red-500">게시글을 찾을 수 없습니다.</h1>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto bg-[#121212] flex flex-col pt-6">
      <BoardDetailClient 
        initialPost={postResult} 
        initialComments={commentResult || []}
      />
    </div>
  );
}
