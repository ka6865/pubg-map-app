import { Metadata } from 'next';
import { supabase } from '@/lib/supabase';
import { getTabSeo } from '@/lib/seo-config';
import BoardListClient from '@/components/board/BoardListClient';

export async function generateMetadata(): Promise<Metadata> {
  return getTabSeo("Board");
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams;
  
  const page = Number(params.page) || 1;
  const filter = (params.f as string) || "전체";
  const searchType = (params.search_type as string) || "all";
  const q = (params.q as string) || "";
  
  const POSTS_PER_PAGE = 10;
  const from = (page - 1) * POSTS_PER_PAGE;
  const to = from + POSTS_PER_PAGE - 1;

  let query = supabase
    .from("posts")
    .select(
      "id, title, author, user_id, category, image_url, discord_url, discord_channel_id, is_notice, created_at, views, likes, comments(count)",
      { count: "exact" }
    );

  if (filter !== "전체" && filter !== "추천") {
    query = query.eq("category", filter);
  }
  if (filter === "추천") {
    query = query.gte("likes", 5);
  }

  if (q) {
    if (searchType === "title") query = query.ilike("title", `%${q}%`);
    else if (searchType === "author") query = query.ilike("author", `%${q}%`);
    else query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`);
  }

  const { data, count, error } = await query
    .order("is_notice", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  let posts = [];
  if (!error && data) {
    posts = data.map((post: any) => ({
      ...post,
      comment_count: post.comments && post.comments[0] ? post.comments[0].count : 0,
    }));
  } else {
    console.error("Board RSC Fetch Error:", error);
  }

  return (
    <div className="w-full h-full overflow-y-auto bg-[#121212] flex flex-col pt-6">
      <div className="w-full max-w-[900px] mx-auto px-4 box-border">
         {/* 게시판 최상단 광고나 배너가 들어갈 수 있는 공간 */}
         <div className="mb-6 flex flex-col items-center">
            <h1 className="text-2xl font-black text-[#F2A900] tracking-tighter italic">커뮤니티</h1>
            <p className="text-white/40 text-xs mt-1">자유롭게 배틀그라운드 정보를 나누는 공간입니다</p>
         </div>

         {/* 데이터는 서버에서 가져오고 뷰는 Client 컴포넌트가 담당 */}
         <BoardListClient 
           posts={posts} 
           totalPosts={count || 0} 
           currentPage={page} 
           currentFilter={filter}
           currentSearchOption={searchType}
           currentSearchQuery={q}
         />
      </div>
    </div>
  );
}
