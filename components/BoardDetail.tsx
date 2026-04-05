"use client";

import { useMemo } from "react"; // 컴포넌트 렌더링 최적화 훅
import { useRouter } from "next/navigation"; // Next.js 페이지 라우터 모듈
import DOMPurify from "isomorphic-dompurify"; // XSS 해킹 방지용 HTML 소독 라이브러리 로드
import Image from "next/image"; // Next.js 이미지 최적화
import CommentSection from "./CommentSection"; // 게시물 하단 대댓글 시스템 컴포넌트 로드
import { Post, Comment } from "../types/board"; // 게시판 및 댓글 데이터 타입 명세서 로드
import type { CurrentUser } from "../types/map";

interface BoardDetailProps {
  selectedPost: Post;
  comments: Comment[];
  currentUser: CurrentUser | null;
  isAdmin: boolean;
  isMobile: boolean;
  boardFilter: string;
  newComment: string;
  setNewComment: (comment: string) => void;
  replyingTo: Comment | null;
  setReplyingTo: (comment: Comment | null) => void;
  handleSaveComment: () => void;
  handleLikePost: (postId: number, currentLikes: number) => void;
  handleDeletePost: (postId: number) => void;
  handleDeleteComment: (commentId: number) => void;
  formatTimeAgo: (dateString: string) => string;
  handleEditClick: () => void;
}

// 악성 스크립트 실행 방지를 위한 DOMPurify 라이브러리 기반 텍스트 소독 함수
const sanitizeHTML = (html: string) => {
  if (!html) return "";
  // 새 창 열기(target="_blank")를 가능하게 하기 위해 target, rel 속성을 허용합니다.
  return DOMPurify.sanitize(html, { ADD_ATTR: ["target", "rel"] });
};

// 개별 게시글 본문 조회 화면 및 작성자 컨트롤 UI 컴포넌트
export default function BoardDetail({
  selectedPost,
  comments,
  currentUser,
  isAdmin,
  isMobile,
  boardFilter,
  newComment,
  setNewComment,
  replyingTo,
  setReplyingTo,
  handleSaveComment,
  handleLikePost,
  handleDeletePost,
  handleDeleteComment,
  formatTimeAgo,
  handleEditClick,
}: BoardDetailProps) {
  const router = useRouter();

  // HTML 원본 문자열 보안 소독 및 모바일 호환을 위한 이미지 태그 스타일 CSS 치환 적용
  const processedContent = useMemo(() => {
    const sanitizedContent = sanitizeHTML(selectedPost.content || "");
    return sanitizedContent.replace(
      /<img/gi,
      '<img style="max-width:100%!important;height:auto!important;display:block;border-radius:8px;margin:10px auto;"'
    );
  }, [selectedPost.content]);

  return (
    <div
      className={`bg-[#1a1a1a] rounded-[8px] border border-[#333] w-full box-border overflow-x-hidden ${
        isMobile ? "p-[15px]" : "p-[30px]"
      }`}
    >
      <div className="mb-[20px]">
        <span className="text-[#F2A900] text-[13px] font-bold">
          [{selectedPost.category}]
        </span>
        <h2
          className={`mt-[10px] text-white break-all font-bold ${
            isMobile ? "text-[24px]" : "text-[32px]"
          }`}
        >
          {selectedPost.title}
        </h2>
        <div className="text-[12px] text-[#888] mt-[12px] flex gap-[10px] flex-wrap">
          <span>글쓴이: {selectedPost.author}</span>
          <span>작성: {formatTimeAgo(selectedPost.created_at)}</span>
          <span>조회: {selectedPost.views}</span>
        </div>
      </div>

      <div className="border-y border-[#333] py-[30px] min-h-[200px] text-[#e5e5e5]">
        {selectedPost.image_url &&
          !(selectedPost.content || "").includes(selectedPost.image_url) && (
            <Image
              src={selectedPost.image_url}
              alt="Thumbnail"
              width={800}
              height={450}
              priority
              className="w-full h-auto mb-[20px] block rounded-[8px]"
            />
          )}

        <div
          dangerouslySetInnerHTML={{ __html: processedContent }}
          className="text-[16px] leading-[1.6] whitespace-normal break-words"
        />

        {selectedPost.category === "패치노트" && (
          <div className="mt-[40px] p-[20px] bg-[#222] border-l-4 border-[#F2A900] rounded-[4px]">
            <p className="text-[14px] text-[#aaa] leading-[1.5]">
              <strong className="text-[#F2A900] block mb-1">📢 안내사항</strong>
              본 게시물은 PUBG 공식 패치노트를 AI로 요약한 정보성 콘텐츠입니다. 
              정확한 수치나 세부 변경 사항은 반드시 아래 공식 홈페이지를 통해 확인하시기 바랍니다.
              <br />
              이 서비스는 팬 메이드 서비스이며 KRAFTON/PUBG의 공식 입장을 대변하지 않습니다.
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end mt-[20px]">
        <button
          onClick={() => handleLikePost(selectedPost.id, selectedPost.likes)}
          className="px-[16px] py-[8px] bg-[#252525] border border-[#F2A900] text-[#F2A900] rounded-[20px] text-[13px] hover:bg-[#F2A900] hover:text-black transition-colors"
        >
          추천 {selectedPost.likes}
        </button>
      </div>

      <CommentSection
        comments={comments}
        currentUser={currentUser}
        newComment={newComment}
        setNewComment={setNewComment}
        replyingTo={replyingTo}
        setReplyingTo={setReplyingTo}
        handleDeleteComment={handleDeleteComment}
        isAdmin={isAdmin}
        handleSaveComment={handleSaveComment}
        isMobile={isMobile}
        formatTimeAgo={formatTimeAgo}
      />

      <div className="mt-[40px] flex gap-[10px]">
        <button
          onClick={() => router.push(`/?tab=Board&f=${boardFilter}`)}
          className="flex-1 p-[12px] bg-[#333] text-white border-none rounded-[4px] hover:bg-[#444] transition-colors text-[14px]"
        >
          목록으로
        </button>

        {currentUser?.id === selectedPost.user_id && (
          <button
            onClick={handleEditClick}
            className="px-[20px] py-[12px] bg-[#34A853] text-white border-none rounded-[4px] hover:bg-[#2a9040] transition-colors text-[14px]"
          >
            수정
          </button>
        )}

        {(currentUser?.id === selectedPost.user_id || isAdmin) && (
          <button
            onClick={() => handleDeletePost(selectedPost.id)}
            className="px-[20px] py-[12px] bg-[#dc3545] text-white border-none rounded-[4px] hover:bg-[#c82333] transition-colors text-[14px]"
          >
            삭제
          </button>
        )}
      </div>
    </div>
  );
}
