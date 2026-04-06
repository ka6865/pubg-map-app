"use client";

import { Dispatch, SetStateAction } from "react"; // React 상태 제어 함수 타입 모듈
import { useRouter } from "next/navigation"; // Next.js 라우터 모듈
import { Post } from "../types/board"; // 게시글 객체 타입 명세

const BOARD_CATEGORIES = ["패치노트", "자유", "듀오/스쿼드 모집", "클럽홍보", "제보/문의"];
const POSTS_PER_PAGE = 10;
const MAX_VISIBLE_PAGES = 5; // 한 번에 보여줄 최대 페이지 버튼 수

// 리스트 내 썸네일 이미지 존재 표시용 SVG 아이콘 컴포넌트 (렌더링 최적화 분리)
const ImageIcon = () => (
  <svg
    className="w-[15px] h-[15px] text-[#34A853] ml-[6px] shrink-0 inline-block"
    fill="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="이미지 포함된 게시글"
    role="img"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z"
    />
  </svg>
);

// 디스코드 채널 링크 존재 표시용 SVG 아이콘
const DiscordIcon = () => (
  <svg
    className="w-[16px] h-[16px] text-[#5865F2] ml-[6px] shrink-0 inline-block"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-label="디스코드 채널 포함됨"
    role="img"
  >
    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0775.0105c.1201.099.246.1971.3718.2914a.077.077 0 01-.0066.1277 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
  </svg>
);

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

// 게시판 목록 테이블 UI 및 페이지네이션 컴포넌트
export default function BoardList({
  posts,
  boardFilter,
  totalPosts,
  page,
  setPage,
  searchInput,
  setSearchInput,
  searchOption,
  setSearchOption,
  handleSearch,
  setIsWriting,
  isMobile,
  formatTimeAgo,
}: BoardListProps) {
  const router = useRouter();

  // 동적 페이지 번호 계산 로직
  const totalPages = Math.max(1, Math.ceil(totalPosts / POSTS_PER_PAGE));
  let startPage = Math.max(1, page - Math.floor(MAX_VISIBLE_PAGES / 2));
  let endPage = startPage + MAX_VISIBLE_PAGES - 1;
  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(1, endPage - MAX_VISIBLE_PAGES + 1);
  }
  const pageNumbers = Array.from(
    { length: endPage - startPage + 1 },
    (_, i) => startPage + i
  );

  return (
    <>
      <div className="flex justify-between mb-[20px] items-center gap-[10px]">
        <div className="flex gap-[8px] overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden flex-1">
          {["전체", "추천", ...BOARD_CATEGORIES].map((f) => (
            <button
              key={f}
              onClick={() => router.push(`/?tab=Board&f=${f}`)}
              className={`px-[12px] py-[6px] rounded-[20px] border border-[#333] whitespace-nowrap text-[13px] cursor-pointer font-bold transition-colors ${
                boardFilter === f
                  ? "bg-[#F2A900]"
                  : "bg-[#1a1a1a] hover:bg-[#2a2a2a]"
              }`}
              style={{
                color: boardFilter === f ? "#000000" : "#aaaaaa",
                WebkitTextFillColor: boardFilter === f ? "#000000" : "#aaaaaa",
                WebkitAppearance: "none",
              }}
            >
              {f}
            </button>
          ))}
        </div>

        <button
          onClick={() => setIsWriting(true)}
          className="px-[16px] py-[8px] bg-[#34A853] rounded-[4px] border-none font-bold text-[13px] whitespace-nowrap cursor-pointer hover:bg-[#2a9040] transition-colors shrink-0"
          style={{
            color: "#ffffff",
            WebkitTextFillColor: "#ffffff",
            WebkitAppearance: "none",
          }}
        >
          글쓰기
        </button>
      </div>

      <div className="bg-[#1a1a1a] rounded-[8px] border border-[#333] overflow-hidden">
        {isMobile ? (
          <ul className="flex flex-col list-none p-0 m-0">
            {posts.map((post) => (
              <li
                key={post.id}
                onClick={() =>
                  router.push(`/?tab=Board&f=${boardFilter}&postId=${post.id}`)
                }
                className={`p-[15px] border-b border-[#222] cursor-pointer transition-colors hover:bg-white/5 flex flex-col gap-1 ${
                  post.is_notice
                    ? "bg-[rgba(242,169,0,0.05)]"
                    : "bg-transparent"
                }`}
              >
                <div className="flex justify-between items-center">
                  <span
                    className="text-[11px] font-bold"
                    style={{
                      color: post.is_notice ? "#F2A900" : "#777777",
                      WebkitTextFillColor: post.is_notice
                        ? "#F2A900"
                        : "#777777",
                    }}
                  >
                    {post.category}
                  </span>
                  <span
                    className="text-[11px]"
                    style={{ color: "#555555", WebkitTextFillColor: "#555555" }}
                  >
                    {formatTimeAgo(post.created_at)}
                  </span>
                </div>

                <div
                  className="flex items-center flex-wrap text-[15px] font-bold leading-[1.4]"
                  style={{
                    color: post.is_notice ? "#F2A900" : "#ffffff",
                    WebkitTextFillColor: post.is_notice ? "#F2A900" : "#ffffff",
                  }}
                >
                  <span className="break-all">{post.title}</span>
                  {post.image_url ? <ImageIcon /> : null}
                  {post.discord_url ? <DiscordIcon /> : null}
                  {(post.comment_count || 0) > 0 ? (
                    <span
                      className="text-[12px] ml-[6px]"
                      style={{
                        color: "#aaaaaa",
                        WebkitTextFillColor: "#aaaaaa",
                      }}
                    >
                      💬 {post.comment_count}
                    </span>
                  ) : null}
                </div>

                <div
                  className="flex justify-between text-[11px] mt-1"
                  style={{ color: "#888888", WebkitTextFillColor: "#888888" }}
                >
                  <span>{post.author}</span>
                  <span>
                    조회 {post.views} · 추천 {post.likes}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <table className="w-full border-collapse text-left text-[14px]">
            <thead className="bg-[#252525] text-[#888]">
              <tr>
                <th className="p-[15px]">분류</th>
                <th className="p-[15px]">제목</th>
                <th className="p-[15px]">글쓴이</th>
                <th className="p-[15px]">작성일</th>
                <th className="p-[15px]">조회</th>
                <th className="p-[15px]">추천</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr
                  key={post.id}
                  onClick={() =>
                    router.push(
                      `/?tab=Board&f=${boardFilter}&postId=${post.id}`
                    )
                  }
                  className={`border-b border-[#222] cursor-pointer transition-colors hover:bg-white/5 ${
                    post.is_notice
                      ? "bg-[rgba(242,169,0,0.05)]"
                      : "bg-transparent"
                  }`}
                >
                  <td
                    className="p-[15px] font-bold"
                    style={{ color: post.is_notice ? "#F2A900" : "#777777" }}
                  >
                    {post.is_notice ? "공지" : post.category}
                  </td>

                  <td className="p-[15px]">
                    <div className="flex items-center">
                      <span
                        style={{
                          color: post.is_notice ? "#F2A900" : "#ffffff",
                          fontWeight: post.is_notice ? "bold" : "normal",
                        }}
                      >
                        {post.title}
                      </span>
                      {post.image_url ? <ImageIcon /> : null}
                      {post.discord_url ? <DiscordIcon /> : null}
                      {(post.comment_count || 0) > 0 ? (
                        <span
                          className="ml-[8px] text-[12px]"
                          style={{ color: "#aaaaaa" }}
                        >
                          💬 {post.comment_count}
                        </span>
                      ) : null}
                    </div>
                  </td>

                  <td className="p-[15px]" style={{ color: "#aaaaaa" }}>
                    {post.author}
                  </td>
                  <td
                    className="p-[15px] text-[13px]"
                    style={{ color: "#888888" }}
                  >
                    {formatTimeAgo(post.created_at)}
                  </td>
                  <td className="p-[15px]" style={{ color: "#666666" }}>
                    {post.views}
                  </td>
                  <td
                    className="p-[15px]"
                    style={{
                      color: post.likes >= 5 ? "#F2A900" : "#666666",
                      fontWeight: post.likes >= 5 ? "bold" : "normal",
                    }}
                  >
                    {post.likes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {posts.length === 0 ? (
          <div className="p-[50px] text-center" style={{ color: "#666666" }}>
            글이 없습니다.
          </div>
        ) : null}
      </div>

      <div
        className={`flex justify-between items-center mt-[20px] gap-[15px] w-full ${
          isMobile ? "flex-col" : "flex-row"
        }`}
      >
        <div className={`flex gap-[5px] ${isMobile ? "w-full" : "w-auto"}`}>
          <select
            value={searchOption}
            onChange={(e) => setSearchOption(e.target.value)}
            className="p-[8px] bg-[#252525] border border-[#333] rounded-[4px] text-[13px] shrink-0 outline-none focus:border-[#F2A900]"
            style={{ color: "#dddddd", WebkitAppearance: "none" }}
          >
            <option value="all">제목+내용</option>
            <option value="title">제목</option>
            <option value="author">글쓴이</option>
          </select>
          <div className="flex bg-[#252525] rounded-[4px] border border-[#333] px-[8px] items-center flex-1 focus-within:border-[#F2A900]">
            <input
              type="text"
              placeholder="검색..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="bg-transparent border-none p-[8px] text-[13px] w-full min-w-[80px] outline-none"
              style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
            />
            <button
              onClick={handleSearch}
              className="bg-transparent border-none cursor-pointer hover:text-white whitespace-nowrap shrink-0"
              style={{ color: "#888888" }}
            >
              조회
            </button>
          </div>
        </div>

        <div className="flex gap-[5px] flex-wrap justify-center">
          <button
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={page === 1}
            className={`px-[12px] py-[8px] border border-[#333] rounded-[4px] transition-colors ${
              page === 1
                ? "bg-[#e0e0e0] cursor-not-allowed"
                : "bg-white hover:bg-[#eee]"
            }`}
            style={{
              color: page === 1 ? "#999999" : "#000000",
              WebkitTextFillColor: page === 1 ? "#999999" : "#000000",
              WebkitAppearance: "none",
            }}
          >
            &lt;
          </button>

          {pageNumbers.map((num) => (
            <button
              key={num}
              onClick={() => setPage(num)}
              className={`px-[12px] py-[8px] border border-[#333] rounded-[4px] text-[13px] transition-colors ${
                page === num
                  ? "bg-[#F2A900] font-bold"
                  : "bg-white font-normal hover:bg-[#eee]"
              }`}
              style={{
                color: "#000000",
                WebkitTextFillColor: "#000000",
                WebkitAppearance: "none",
              }}
            >
              {num}
            </button>
          ))}

          <button
            onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={page >= totalPages || totalPosts === 0}
            className={`px-[12px] py-[8px] border border-[#333] rounded-[4px] transition-colors ${
              page >= totalPages || totalPosts === 0
                ? "bg-[#e0e0e0] cursor-not-allowed"
                : "bg-white hover:bg-[#eee]"
            }`}
            style={{
              color:
                page >= totalPages || totalPosts === 0 ? "#999999" : "#000000",
              WebkitTextFillColor:
                page >= totalPages || totalPosts === 0 ? "#999999" : "#000000",
              WebkitAppearance: "none",
            }}
          >
            &gt;
          </button>
        </div>
      </div>
    </>
  );
}
