"use client";

import { useMemo } from "react"; // 변수 캐싱 및 성능 최적화 훅 로드
import { Post, Comment } from "../types/board"; // 댓글 관련 데이터 구조 타입 매핑 로드

interface CommentSectionProps {
  comments: Comment[];
  selectedPost: Post;
  currentUser: any;
  displayName: string;
  newComment: string;
  setNewComment: (comment: string) => void;
  replyingTo: Comment | null;
  setReplyingTo: (comment: Comment | null) => void;
  handleSaveComment: () => void;
  handleDeleteComment: (commentId: number) => void;
  isAdmin: boolean;
  isMobile: boolean;
  formatTimeAgo: (dateString: string) => string;
}

// 게시물 상세 화면 내 하위 댓글 및 대댓글 UI 출력 컴포넌트
export default function CommentSection({
  comments,
  selectedPost,
  currentUser,
  displayName,
  newComment,
  setNewComment,
  replyingTo,
  setReplyingTo,
  handleSaveComment,
  handleDeleteComment,
  isAdmin,
  isMobile,
  formatTimeAgo,
}: CommentSectionProps) {
  // 다중 계층 렌더링 성능 향상을 위한 부모 ID(parent_id) 기준 데이터 Map 구조화
  const commentsByParent = useMemo(() => {
    const map = new Map<number | null, Comment[]>();
    comments.forEach((c) => {
      const pid = c.parent_id || null;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(c);
    });
    return map;
  }, [comments]);

  // 대댓글 출력용 재귀 함수. 배열의 하위 노드 존재 시 Depth를 1씩 증가시키며 HTML 반환
  const renderComments = (parentId: number | null, depth = 0) => {
    const list = commentsByParent.get(parentId);
    if (!list || list.length === 0) return null;

    return list.map((c) => (
      <div
        key={c.id}
        className={`mt-[10px] ${
          depth > 0 ? (isMobile ? "ml-[10px]" : "ml-[20px]") : "ml-0"
        }`}
      >
        <div
          className={`p-[15px] rounded-[8px] ${
            depth > 0
              ? "bg-[#2a2a2a] border-l-[3px] border-[#F2A900]"
              : "bg-[#222] border-l-[3px] border-[#34A853]"
          }`}
        >
          <div className="flex justify-between mb-[6px]">
            <div className="flex items-center gap-[8px] flex-wrap">
              {depth > 0 && (
                <span className="text-[#F2A900] text-[12px]">ㄴ</span>
              )}
              <span
                className={`text-[13px] font-bold ${
                  depth > 0 ? "text-[#F2A900]" : "text-[#34A853]"
                }`}
              >
                {c.author}
              </span>
              <span className="text-[11px] text-[#666]">
                {formatTimeAgo(c.created_at)}
              </span>
            </div>

            <div className="flex gap-[10px]">
              {currentUser && (
                <button
                  onClick={() => {
                    setReplyingTo(c);
                    setNewComment("");
                  }}
                  className="bg-transparent border-none text-[#aaa] text-[12px] cursor-pointer underline hover:text-white transition-colors"
                >
                  답글
                </button>
              )}
              {(currentUser?.id === c.user_id || isAdmin) && (
                <button
                  onClick={() => handleDeleteComment(c.id)}
                  className="bg-transparent border-none text-[#dc3545] text-[12px] cursor-pointer underline hover:text-[#ff4d4d] transition-colors"
                >
                  삭제
                </button>
              )}
            </div>
          </div>

          <div className="text-[14px] text-[#ddd] leading-[1.5] break-all">
            {c.content}
          </div>
        </div>
        {renderComments(c.id, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="mt-[40px]">
      <h3 className="text-[#F2A900] m-0 mb-[20px] font-bold text-[18px]">
        댓글 ({comments.length})
      </h3>

      <div className="flex flex-col gap-[5px]">{renderComments(null, 0)}</div>

      {currentUser && (
        <div className="mt-[25px] flex flex-col gap-[10px]">
          {replyingTo && (
            <div className="text-[13px] text-[#F2A900] flex items-center gap-[10px]">
              <span>
                ㄴ <strong>{replyingTo.author}</strong>님에게 답글 중
              </span>
              <button
                onClick={() => {
                  setReplyingTo(null);
                  setNewComment("");
                }}
                className="bg-transparent border-none text-[#666] cursor-pointer text-[12px] hover:text-white transition-colors"
              >
                취소
              </button>
            </div>
          )}

          <div className="flex gap-[8px]">
            <div className="flex-1 flex bg-[#111] border border-[#333] rounded-[4px] focus-within:border-[#F2A900] transition-colors p-[10px] gap-[8px] items-start">
              {replyingTo && (
                <span className="text-[#F2A900] font-bold text-[13px] whitespace-nowrap pt-[2px] select-none">
                  @{replyingTo.author}
                </span>
              )}

              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={
                  replyingTo ? "답글 내용을 입력하세요..." : "댓글 입력..."
                }
                className="flex-1 h-[60px] bg-transparent border-none resize-none outline-none text-white p-0 m-0"
                spellCheck={false}
                style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
              />
            </div>

            <button
              onClick={handleSaveComment}
              className="bg-[#34A853] border-none rounded-[4px] w-[60px] font-bold text-[13px] hover:bg-[#2a9040] transition-colors cursor-pointer shrink-0"
              style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
            >
              {replyingTo ? "답글" : "등록"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
