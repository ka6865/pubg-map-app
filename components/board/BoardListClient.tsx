'use client';

import React, { useId, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Post } from "@/types/board";
import { PenLine } from "lucide-react";
import PostItem from "./PostItem";
import BoardSearch from "./BoardSearch";
import BoardPagination from "./BoardPagination";

const BOARD_CATEGORIES = ["패치노트", "자유", "듀오/스쿼드 모집", "클럽홍보", "제보/문의"];
const POSTS_PER_PAGE = 10;
const MAX_VISIBLE_PAGES = 5;


interface BoardListClientProps {
  posts: Post[];
  totalPosts: number;
  currentPage: number;
  currentFilter: string;
  currentSearchOption?: string;
  currentSearchQuery?: string;
}

export default function BoardListClient({
  posts,
  totalPosts,
  currentPage,
  currentFilter,
  currentSearchOption = "all",
  currentSearchQuery = "",
}: BoardListClientProps) {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const [searchInput, setSearchInput] = useState(currentSearchQuery);
  const [searchOption, setSearchOption] = useState(currentSearchOption);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalPosts / POSTS_PER_PAGE));
  let startPage = Math.max(1, currentPage - Math.floor(MAX_VISIBLE_PAGES / 2));
  let endPage = startPage + MAX_VISIBLE_PAGES - 1;
  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(1, endPage - MAX_VISIBLE_PAGES + 1);
  }
  const pageNumbers = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = (now.getTime() - date.getTime()) / 1000;
    if (diff < 60) return "방금 전";
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return date.toLocaleDateString();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const searchParams = new URLSearchParams();
    if (currentFilter !== "전체") searchParams.set("f", currentFilter);
    if (searchInput) {
      searchParams.set("q", searchInput);
      searchParams.set("search_type", searchOption);
    }
    router.push(`/board?${searchParams.toString()}`);
  };

  const buildPageLink = (page: number) => {
    const params = new URLSearchParams();
    if (currentFilter !== "전체") params.set("f", currentFilter);
    if (currentSearchQuery) {
      params.set("q", currentSearchQuery);
      params.set("search_type", currentSearchOption);
    }
    params.set("page", page.toString());
    return `/board?${params.toString()}`;
  };

  return (
    <div className="w-full flex justify-center pb-20">
      <div className="w-full max-w-[900px]">
        {/* 상단 필터 및 글쓰기 버튼 */}
        <div className="flex justify-between items-center mb-4 gap-2">
          <div className="flex gap-2 overflow-x-auto no-scrollbar flex-1 py-1 px-1">
            {["전체", "추천", ...BOARD_CATEGORIES].map((f) => {
              const isActive = currentFilter === f;
              const href = f === "전체" ? "/board" : `/board?f=${f}`;
              return (
                <Link key={f} href={href} className="shrink-0">
                  <button
                    className={`px-3.5 py-1.5 rounded-full border text-xs whitespace-nowrap transition-all ${
                      isActive
                        ? "border-[#F2A900] bg-[#F2A900] text-black font-bold"
                        : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10"
                    }`}
                  >
                    {f}
                  </button>
                </Link>
              );
            })}
          </div>

          <Link href="/board/write" className="shrink-0">
            <button className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#F2A900] border-none rounded-lg font-bold text-[13px] text-black hover:bg-[#d4940a] active:scale-95 transition-all">
              <PenLine size={14} strokeWidth={2.5} />
              글쓰기
            </button>
          </Link>
        </div>

        {/* 게시글 목록 */}
        <div className="bg-[#161616] rounded-xl border border-white/10 overflow-hidden">
          {posts.length === 0 ? (
            <div className="py-16 text-center text-white/30">
              <p className="text-sm">조건에 맞는 게시글이 없습니다</p>
            </div>
          ) : isMobile ? (
            <ul className="list-none p-0 m-0">
              {posts.map((post) => (
                <PostItem 
                  key={post.id} 
                  post={post} 
                  isMobile={true} 
                  onClickDesktop={() => router.push(`/board/${post.id}`)}
                  formatTimeAgo={formatTimeAgo} 
                />
              ))}
            </ul>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  {["분류", "제목", "글쓴이", "작성일", "조회", "추천"].map((h) => (
                    <th key={h} className="p-3 text-left text-[10px] font-bold tracking-widest uppercase text-white/30">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <PostItem 
                    key={post.id} 
                    post={post} 
                    isMobile={false}
                    onClickDesktop={() => router.push(`/board/${post.id}`)}
                    formatTimeAgo={formatTimeAgo} 
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 하단 검색 및 페이지네이션 */}
        <div className="flex justify-between items-center mt-4 flex-wrap gap-3">
          <BoardSearch 
            searchOption={searchOption}
            setSearchOption={setSearchOption}
            searchInput={searchInput}
            setSearchInput={setSearchInput}
            onSearch={handleSearch}
          />

          <BoardPagination 
            currentPage={currentPage}
            totalPages={totalPages}
            pageNumbers={pageNumbers}
            buildPageLink={buildPageLink}
          />
        </div>
      </div>
    </div>
  );
}
