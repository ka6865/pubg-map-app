"use client";

import React, { Dispatch, SetStateAction, useId } from "react";
import { useRouter } from "next/navigation";
import { Post } from "../types/board";
import { Search, PenLine, Image, MessageCircle, ChevronLeft, ChevronRight } from "lucide-react";

const BOARD_CATEGORIES = ["패치노트", "자유", "듀오/스쿼드 모집", "클럽홍보", "제보/문의"];
const POSTS_PER_PAGE = 10;
const MAX_VISIBLE_PAGES = 5;

// 이미지 포함 아이콘
const ImageIcon = () => (
  <Image size={13} className="text-emerald-400 ml-[5px] shrink-0 inline-block" aria-label="이미지 포함" />
);

// 디스코드 아이콘
const DiscordIcon = () => (
  <svg
    className="w-[14px] h-[14px] ml-[5px] shrink-0 inline-block"
    style={{ color: "#5865F2" }}
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
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const searchFormId = useId();
  const searchSelectId = useId();
  const searchInputId = useId();
  const searchSubmitId = useId();

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
      {/* ── 상단 툴바 ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          gap: "10px",
        }}
      >
        {/* 카테고리 필터 pill */}
        <div
          style={{
            display: "flex",
            gap: "6px",
            overflowX: "auto",
            scrollbarWidth: "none",
            flex: 1,
          }}
        >
          {["전체", "추천", ...BOARD_CATEGORIES].map((f) => {
            const isActive = boardFilter === f;
            return (
              <button
                key={f}
                onClick={() => router.push(`/board?f=${f}`)}
                style={{
                  padding: "5px 13px",
                  borderRadius: "20px",
                  border: `1px solid ${isActive ? "#F2A900" : "rgba(255,255,255,0.1)"}`,
                  whiteSpace: "nowrap",
                  fontSize: "12px",
                  fontWeight: isActive ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  backgroundColor: isActive
                    ? "#F2A900"
                    : "rgba(255,255,255,0.04)",
                  color: isActive ? "#000" : "rgba(255,255,255,0.5)",
                  letterSpacing: "0.01em",
                }}
              >
                {f}
              </button>
            );
          })}
        </div>

        {/* 글쓰기 버튼 */}
        <button
          onClick={() => router.push("/board/write")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "7px 14px",
            backgroundColor: "#F2A900",
            border: "none",
            borderRadius: "8px",
            fontWeight: 700,
            fontSize: "13px",
            color: "#000",
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all 0.15s ease",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#d4940a";
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.98)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F2A900";
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          }}
        >
          <PenLine size={14} strokeWidth={2.5} />
          글쓰기
        </button>
      </div>

      {/* ── 게시글 목록 ── */}
      <div
        style={{
          backgroundColor: "var(--color-bg-surface, #161616)",
          borderRadius: "12px",
          border: "1px solid var(--color-border, rgba(255,255,255,0.08))",
          overflow: "hidden",
        }}
      >
        {isMobile ? (
          /* 모바일: 카드형 리스트 */
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {posts.map((post, idx) => (
              <li
                key={post.id}
                onClick={() => router.push(`/board/${post.id}`)}
                style={{
                  padding: "14px 16px",
                  borderBottom: idx < posts.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  cursor: "pointer",
                  transition: "background-color 0.15s ease",
                  backgroundColor: post.is_notice
                    ? "rgba(242,169,0,0.04)"
                    : "transparent",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLLIElement).style.backgroundColor =
                    post.is_notice ? "rgba(242,169,0,0.07)" : "rgba(255,255,255,0.03)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLLIElement).style.backgroundColor =
                    post.is_notice ? "rgba(242,169,0,0.04)" : "transparent")
                }
              >
                {/* 카테고리 + 시간 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: post.is_notice ? "#F2A900" : "rgba(255,255,255,0.3)",
                      backgroundColor: post.is_notice ? "rgba(242,169,0,0.12)" : "rgba(255,255,255,0.06)",
                      padding: "2px 7px",
                      borderRadius: "4px",
                    }}
                  >
                    {post.is_notice ? "📢 공지" : post.category}
                  </span>
                  <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)" }}>
                    {formatTimeAgo(post.created_at)}
                  </span>
                </div>

                {/* 제목 */}
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: post.is_notice ? 700 : 500,
                      color: post.is_notice ? "#F2A900" : "rgba(255,255,255,0.9)",
                      lineHeight: 1.4,
                      wordBreak: "break-all",
                    }}
                  >
                    {post.title}
                  </span>
                  {post.image_url && <ImageIcon />}
                  {post.discord_url && <DiscordIcon />}
                  {(post.comment_count || 0) > 0 && (
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginLeft: "4px", display: "flex", alignItems: "center", gap: "2px" }}>
                      <MessageCircle size={11} />
                      {post.comment_count}
                    </span>
                  )}
                </div>

                {/* 작성자 + 조회/추천 */}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "rgba(255,255,255,0.28)" }}>
                  <span>{post.author}</span>
                  <span>조회 {post.views} · 추천 {post.likes}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          /* 데스크톱: 테이블 */
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ backgroundColor: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["분류", "제목", "글쓴이", "작성일", "조회", "추천"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "10px",
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.3)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr
                  key={post.id}
                  onClick={() => router.push(`/board/${post.id}`)}
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    cursor: "pointer",
                    transition: "background-color 0.12s ease",
                    backgroundColor: post.is_notice
                      ? "rgba(242,169,0,0.04)"
                      : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    const row = e.currentTarget as HTMLTableRowElement;
                    row.style.backgroundColor = post.is_notice
                      ? "rgba(242,169,0,0.07)"
                      : "rgba(255,255,255,0.03)";
                    // 왼쪽 경계선 효과
                    const firstCell = row.querySelector("td") as HTMLTableCellElement | null;
                    if (firstCell) firstCell.style.borderLeft = `2px solid ${post.is_notice ? "#F2A900" : "rgba(255,255,255,0.2)"}`;
                  }}
                  onMouseLeave={(e) => {
                    const row = e.currentTarget as HTMLTableRowElement;
                    row.style.backgroundColor = post.is_notice ? "rgba(242,169,0,0.04)" : "transparent";
                    const firstCell = row.querySelector("td") as HTMLTableCellElement | null;
                    if (firstCell) firstCell.style.borderLeft = "2px solid transparent";
                  }}
                >
                  {/* 분류 */}
                  <td
                    style={{
                      padding: "14px 16px",
                      borderLeft: "2px solid transparent",
                      transition: "border-color 0.12s ease",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: post.is_notice ? "#F2A900" : "rgba(255,255,255,0.3)",
                        backgroundColor: post.is_notice ? "rgba(242,169,0,0.1)" : "rgba(255,255,255,0.05)",
                        padding: "2px 7px",
                        borderRadius: "4px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {post.is_notice ? "공지" : post.category}
                    </span>
                  </td>

                  {/* 제목 */}
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span
                        style={{
                          color: post.is_notice ? "#F2A900" : "rgba(255,255,255,0.88)",
                          fontWeight: post.is_notice ? 700 : 400,
                        }}
                      >
                        {post.title}
                      </span>
                      {post.image_url && <ImageIcon />}
                      {post.discord_url && <DiscordIcon />}
                      {(post.comment_count || 0) > 0 && (
                        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", marginLeft: "4px", display: "flex", alignItems: "center", gap: "2px" }}>
                          <MessageCircle size={11} />
                          {post.comment_count}
                        </span>
                      )}
                    </div>
                  </td>

                  <td style={{ padding: "14px 16px", color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
                    {post.author}
                  </td>
                  <td style={{ padding: "14px 16px", color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap", fontSize: "12px" }}>
                    {formatTimeAgo(post.created_at)}
                  </td>
                  <td style={{ padding: "14px 16px", color: "rgba(255,255,255,0.25)" }}>
                    {post.views}
                  </td>
                  <td style={{ padding: "14px 16px", fontWeight: post.likes >= 5 ? 700 : 400 }}>
                    <span
                      style={{
                        color: post.likes >= 5 ? "#F2A900" : "rgba(255,255,255,0.25)",
                        backgroundColor: post.likes >= 5 ? "rgba(242,169,0,0.1)" : "transparent",
                        padding: post.likes >= 5 ? "2px 7px" : "0",
                        borderRadius: "4px",
                      }}
                    >
                      {post.likes}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 빈 상태 */}
        {posts.length === 0 && (
          <div
            style={{
              padding: "60px 20px",
              textAlign: "center",
              color: "rgba(255,255,255,0.2)",
            }}
          >
            <p style={{ fontSize: "14px", marginBottom: "4px" }}>게시글이 없습니다</p>
            <p style={{ fontSize: "12px" }}>첫 번째 글을 작성해 보세요</p>
          </div>
        )}
      </div>

      {/* ── 하단 검색 + 페이지네이션 ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "16px",
          gap: "12px",
          flexWrap: isMobile ? "wrap" : "nowrap",
        }}
      >
        {/* 검색 폼 */}
        <form
          id={searchFormId}
          name="board_search_form"
          onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
          style={{
            display: "flex",
            gap: "6px",
            width: mounted && isMobile ? "100%" : "auto",
          }}
        >
          <label htmlFor={searchSelectId} className="sr-only">검색 옵션 선택</label>
          <select
            id={searchSelectId}
            name="search_type"
            value={searchOption}
            onChange={(e) => setSearchOption(e.target.value)}
            style={{
              padding: "8px 10px",
              backgroundColor: "var(--color-bg-elevated, #1f1f1f)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              fontSize: "12px",
              color: "rgba(255,255,255,0.6)",
              outline: "none",
              cursor: "pointer",
              flexShrink: 0,
              WebkitAppearance: "none",
            }}
          >
            <option value="all">제목+내용</option>
            <option value="title">제목</option>
            <option value="author">글쓴이</option>
          </select>

          <div
            style={{
              display: "flex",
              backgroundColor: "var(--color-bg-elevated, #1f1f1f)",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.1)",
              alignItems: "center",
              paddingLeft: "10px",
              paddingRight: "4px",
              flex: 1,
              transition: "border-color 0.15s ease, box-shadow 0.15s ease",
            }}
            className="focus-glow"
          >
            <Search size={13} style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
            <label htmlFor={searchInputId} className="sr-only">검색어 입력</label>
            <input
              id={searchInputId}
              name="q"
              type="text"
              autoComplete="off"
              placeholder="검색..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{
                background: "transparent",
                border: "none",
                padding: "8px 6px",
                fontSize: "13px",
                color: "white",
                width: "100%",
                minWidth: "80px",
                outline: "none",
              }}
            />
            <button
              id={searchSubmitId}
              name="search_submit"
              type="submit"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "rgba(255,255,255,0.4)",
                padding: "4px 8px",
                fontSize: "12px",
                fontWeight: 600,
                transition: "color 0.15s ease",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "white")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)")}
            >
              조회
            </button>
          </div>
        </form>

        {/* 페이지네이션 */}
        <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          {/* 이전 */}
          <button
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={page === 1}
            style={{
              width: "34px",
              height: "34px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.1)",
              backgroundColor: page === 1 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
              color: page === 1 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.6)",
              cursor: page === 1 ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <ChevronLeft size={15} />
          </button>

          {pageNumbers.map((num) => (
            <button
              key={num}
              onClick={() => setPage(num)}
              style={{
                width: "34px",
                height: "34px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "8px",
                border: `1px solid ${page === num ? "#F2A900" : "rgba(255,255,255,0.1)"}`,
                backgroundColor: page === num ? "#F2A900" : "rgba(255,255,255,0.04)",
                color: page === num ? "#000" : "rgba(255,255,255,0.5)",
                fontWeight: page === num ? 700 : 400,
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (page !== num) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.08)";
                  (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.8)";
                }
              }}
              onMouseLeave={(e) => {
                if (page !== num) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.04)";
                  (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.5)";
                }
              }}
            >
              {num}
            </button>
          ))}

          {/* 다음 */}
          <button
            onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={page >= totalPages || totalPosts === 0}
            style={{
              width: "34px",
              height: "34px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.1)",
              backgroundColor:
                page >= totalPages || totalPosts === 0
                  ? "rgba(255,255,255,0.03)"
                  : "rgba(255,255,255,0.06)",
              color:
                page >= totalPages || totalPosts === 0
                  ? "rgba(255,255,255,0.15)"
                  : "rgba(255,255,255,0.6)",
              cursor:
                page >= totalPages || totalPosts === 0 ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </>
  );
}
