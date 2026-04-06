"use client";

import { useMemo } from "react"; // React 상태 및 생명주기 관리 훅
import { useRouter } from "next/navigation"; // Next.js 페이지 라우터 모듈
import DOMPurify from "isomorphic-dompurify"; // XSS 해킹 방지용 HTML 소독 라이브러리 로드
import "react-quill-new/dist/quill.snow.css"; // 🌟 Quill 에디터 스타일 임포트
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
  return DOMPurify.sanitize(html, { 
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "s", "ul", "ol", "li", 
      "h1", "h2", "h3", "blockquote", "img", "a", "span", "iframe"
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "src", "style", "class", "width", "height", "alt", "title", "frameborder", "allow", "allowfullscreen"]
  });
};

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

  // 본문 렌더링을 위한 HTML 가공 (줄바꿈 및 이미지 스타일 처리)
  const processedContent = useMemo(() => {
    let sanitizedContent = sanitizeHTML(selectedPost.content || "");
    
    // 🌟 가독성을 위한 엔터(줄바꿈) 보정 로직 (유지)
    sanitizedContent = sanitizedContent
      .replace(/<p>\s*<\/p>/g, '<p><br/></p>')
      .replace(/<p><br><\/p>/g, '<p><br/></p>')
      .replace(/<p>&nbsp;<\/p>/g, '<p><br/></p>')
      .replace(/<div>\s*<\/div>/g, '<div><br/></div>');

    return sanitizedContent.replace(
      /<img/gi,
      '<img style="max-width:100%!important;height:auto!important;display:block;border-radius:8px;margin:20px auto;"'
    );
  }, [selectedPost.content]);
  
  // 🌟 줄바꿈 보정을 위한 본문 스타일 (최소한의 여백만 유지)
  const boardContentStyles = (
    <style>{`
      .board-content.ql-editor > * {
        margin-bottom: 1.5rem !important;
        margin-top: 0 !important;
        line-height: 1.8 !important;
      }

      .board-content.ql-editor p:empty::before,
      .board-content.ql-editor div:empty::before {
        content: "\\00a0" !important;
        display: inline-block !important;
        width: 100% !important;
        height: 1.2rem !important;
      }

      .board-content.ql-editor ul, 
      .board-content.ql-editor ol {
        padding-left: 2rem !important;
        list-style-position: outside !important;
      }
      .board-content.ql-editor ul { list-style-type: disc !important; }
      .board-content.ql-editor ol { list-style-type: decimal !important; }
      .board-content.ql-editor li {
        margin-bottom: 0.5rem !important;
        display: list-item !important;
      }

      .board-content.ql-editor {
        white-space: pre-wrap !important;
        word-break: break-word !important;
        font-family: inherit !important;
        color: #e5e5e5 !important;
      }
    `}</style>
  );

  return (
    <article
      className={`bg-[#1a1a1a] rounded-[8px] border border-[#333] w-full box-border overflow-x-hidden ${
        isMobile ? "p-[15px]" : "p-[30px]"
      }`}
    >
      <div className="mb-[20px]">
        <span className="text-[#F2A900] text-[13px] font-bold">
          [{selectedPost.category}]
        </span>
        <h1
          className={`mt-[10px] text-white break-all font-bold ${
            isMobile ? "text-[24px]" : "text-[32px]"
          }`}
        >
          {selectedPost.title}
        </h1>
        <div className="text-[12px] text-[#888] mt-[12px] flex gap-[10px] flex-wrap">
          <span>글쓴이: {selectedPost.author}</span>
          <span>작성: {formatTimeAgo(selectedPost.created_at)}</span>
          <span>조회: {selectedPost.views}</span>
        </div>

        {selectedPost.discord_url && (
          <div className="mt-[20px]">
            <a
              href={selectedPost.discord_url.startsWith('http') ? selectedPost.discord_url : `https://${selectedPost.discord_url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-[20px] py-[12px] bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-[8px] transition-all shadow-lg hover:shadow-[#5865F2]/20 no-underline"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0775.0105c.1201.099.246.1971.3718.2914a.077.077 0 01-.0066.1277 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>
              </svg>
              디스코드 음성 채널 입장하기
            </a>
          </div>
        )}
      </div>

      <div className="border-y border-[#333] py-[30px] min-h-[200px] text-[#e5e5e5]">
        {selectedPost.image_url &&
          !(selectedPost.content || "").includes(selectedPost.image_url) && (
            <Image
              src={selectedPost.image_url}
              alt={`${selectedPost.title} 이미지`}
              width={800}
              height={450}
              priority
              className="w-full h-auto mb-[20px] block rounded-[8px]"
            />
          )}

        {boardContentStyles}
        <div className="ql-container ql-snow" style={{ border: 'none', font: 'inherit', color: 'inherit' }}>
          <div
            dangerouslySetInnerHTML={{ __html: processedContent }}
            className="ql-editor board-content text-[16px]"
            style={{ 
              padding: 0, 
              height: 'auto', 
              overflow: 'visible', 
              color: 'inherit', 
              font: 'inherit',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}
          />
        </div>

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
    </article>
  );
}
