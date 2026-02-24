'use client';

import { Dispatch, SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { Post } from '../types/board';

const BOARD_CATEGORIES = ['자유', '듀오/스쿼드 모집', '클럽홍보', '제보/문의'];
const POSTS_PER_PAGE = 10;

interface BoardListProps {
  posts: Post[];
  boardFilter: string;
  totalPosts: number;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  searchInput: string;
  setSearchInput: (input: string) => void;
  searchOption: string;
  setSearchOption: (option: string) => void;
  handleSearch: () => void;
  setIsWriting: (isWriting: boolean) => void;
  isMobile: boolean;
  formatTimeAgo: (dateString: string) => string;
}

export default function BoardList({
  posts, boardFilter, totalPosts, page, setPage, searchInput, setSearchInput,
  searchOption, setSearchOption, handleSearch, setIsWriting, isMobile, formatTimeAgo
}: BoardListProps) {

  const router = useRouter();

  return (
    <>
      <div className="flex justify-between mb-[20px] items-center gap-[10px]">
        <div className="flex gap-[8px] overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {['전체', '추천', ...BOARD_CATEGORIES].map(f => (
            <button 
              key={f} 
              onClick={() => router.push(`/?tab=Board&f=${f}`)} 
              className={`px-[12px] py-[6px] rounded-[20px] border border-[#333] whitespace-nowrap text-[13px] cursor-pointer font-bold transition-colors
                ${boardFilter === f ? 'bg-[#F2A900] text-black' : 'bg-[#1a1a1a] text-[#aaa] hover:bg-[#2a2a2a]'}`}
            >
              {f}
            </button>
          ))}
        </div>
        <button 
          onClick={() => setIsWriting(true)} 
          className="px-[16px] py-[8px] bg-[#34A853] text-white rounded-[4px] border-none font-bold text-[13px] whitespace-nowrap cursor-pointer hover:bg-[#2a9040] transition-colors"
        >
          글쓰기
        </button>
      </div>

      <div className="bg-[#1a1a1a] rounded-[8px] border border-[#333] overflow-hidden">
        {isMobile ? (
          <div className="flex flex-col">
             {posts.map(post => (
                <div 
                  key={post.id} 
                  onClick={() => router.push(`/?tab=Board&f=${boardFilter}&postId=${post.id}`)} 
                  className={`p-[15px] border-b border-[#222] cursor-pointer transition-colors hover:bg-white/5 ${post.is_notice ? 'bg-[rgba(242,169,0,0.05)]' : 'bg-transparent'}`}
                >
                   <div className="flex justify-between mb-[5px]">
                      <span className={`text-[11px] font-bold ${post.is_notice ? 'text-[#F2A900]' : 'text-[#777]'}`}>{post.category}</span>
                      <span className="text-[11px] text-[#555]">{formatTimeAgo(post.created_at)}</span>
                   </div>
                   <div className={`text-[15px] font-bold mb-[8px] leading-[1.4] ${post.is_notice ? 'text-[#F2A900]' : 'text-white'}`}>
                      {post.title} 
                      {(post.comment_count || 0) > 0 && <span className="text-[12px] text-[#aaa] ml-[6px]">💬 {post.comment_count}</span>}
                   </div>
                   <div className="flex justify-between text-[11px] text-[#888]">
                      <span>{post.author}</span>
                      <span>조회 {post.views} · 추천 {post.likes}</span>
                   </div>
                </div>
             ))}
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-[14px]">
            <thead className="bg-[#252525] text-[#888]">
              <tr>
                <th className="p-[15px]">분류</th><th className="p-[15px]">제목</th><th className="p-[15px]">글쓴이</th><th className="p-[15px]">작성일</th><th className="p-[15px]">조회</th><th className="p-[15px]">추천</th>
              </tr>
            </thead>
            <tbody>
              {posts.map(post => (
                <tr 
                  key={post.id} 
                  onClick={() => router.push(`/?tab=Board&f=${boardFilter}&postId=${post.id}`)} 
                  className={`border-b border-[#222] cursor-pointer transition-colors hover:bg-white/5 ${post.is_notice ? 'bg-[rgba(242,169,0,0.05)]' : 'bg-transparent'}`}
                >
                  <td className={`p-[15px] font-bold ${post.is_notice ? 'text-[#F2A900]' : 'text-[#777]'}`}>{post.is_notice ? '공지' : post.category}</td>
                  <td className={`p-[15px] ${post.is_notice ? 'text-[#F2A900] font-bold' : 'text-white font-normal'}`}>
                    {post.title}
                    {(post.comment_count || 0) > 0 && <span className="ml-[8px] text-[12px] text-[#aaa]">💬 {post.comment_count}</span>}
                  </td>
                  <td className="p-[15px] text-[#aaa]">{post.author}</td>
                  <td className="p-[15px] text-[#888] text-[13px]">{formatTimeAgo(post.created_at)}</td>
                  <td className="p-[15px] text-[#666]">{post.views}</td>
                  <td className={`p-[15px] ${post.likes >= 5 ? 'text-[#F2A900] font-bold' : 'text-[#666] font-normal'}`}>{post.likes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {posts.length === 0 && <div className="p-[50px] text-center text-[#666]">글이 없습니다.</div>}
      </div>

      <div className={`flex justify-between items-center mt-[20px] gap-[15px] w-full ${isMobile ? 'flex-col' : 'flex-row'}`}>
          <div className={`flex gap-[5px] ${isMobile ? 'w-full' : 'w-auto'}`}>
            <select 
              value={searchOption} 
              onChange={(e) => setSearchOption(e.target.value)} 
              className="p-[8px] bg-[#252525] text-[#ddd] border border-[#333] rounded-[4px] text-[13px] shrink-0 outline-none focus:border-[#F2A900] transition-colors"
            >
              <option value="all">제목+내용</option>
              <option value="title">제목</option>
              <option value="author">글쓴이</option>
            </select>
            <div className="flex bg-[#252525] rounded-[4px] border border-[#333] px-[8px] items-center flex-1 focus-within:border-[#F2A900] transition-colors">
                <input 
                  type="text" 
                  placeholder="검색..." 
                  value={searchInput} 
                  onChange={(e) => setSearchInput(e.target.value)} 
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()} 
                  className="bg-transparent border-none text-white p-[8px] text-[13px] w-full min-w-[80px] outline-none" 
                />
                <button onClick={handleSearch} className="bg-transparent border-none cursor-pointer text-[#888] hover:text-white transition-colors">🔍</button>
            </div>
          </div>

          <div className="flex gap-[5px] flex-wrap justify-center">
              <button 
                onClick={() => setPage(prev => Math.max(prev - 1, 1))} 
                disabled={page === 1} 
                className={`px-[12px] py-[8px] border border-[#333] bg-[#1a1a1a] text-white rounded-[4px] transition-colors ${page === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#2a2a2a]'}`}
              >&lt;</button>
              {[...Array(Math.ceil(totalPosts / POSTS_PER_PAGE))].map((_, i) => (
                <button 
                  key={i} 
                  onClick={() => setPage(i + 1)} 
                  className={`px-[12px] py-[8px] border border-[#333] rounded-[4px] text-[13px] transition-colors
                    ${page === i + 1 ? 'bg-[#F2A900] text-black font-bold' : 'bg-[#1a1a1a] text-white font-normal hover:bg-[#2a2a2a]'}`}
                >
                  {i + 1}
                </button>
              ))}
              <button 
                onClick={() => setPage(prev => Math.min(prev + 1, Math.ceil(totalPosts / POSTS_PER_PAGE)))} 
                disabled={page >= Math.ceil(totalPosts / POSTS_PER_PAGE) || totalPosts === 0} 
                className={`px-[12px] py-[8px] border border-[#333] bg-[#1a1a1a] text-white rounded-[4px] transition-colors ${(page >= Math.ceil(totalPosts / POSTS_PER_PAGE) || totalPosts === 0) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#2a2a2a]'}`}
              >&gt;</button>
          </div>
      </div>
    </>
  );
}