'use client';

import { Post, Comment } from '../types/board'; 

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
  isMobile: boolean;
  formatTimeAgo: (dateString: string) => string;
}

export default function CommentSection({
  comments, selectedPost, currentUser, displayName, newComment, setNewComment,
  replyingTo, setReplyingTo, handleSaveComment, isMobile, formatTimeAgo,
}: CommentSectionProps) {

  // 댓글 렌더링 함수 (대댓글 구조 처리를 위한 재귀 호출)
  const renderComments = (parentId: number | null = null, depth = 0) => {
    const list = comments.filter(c => c.parent_id === parentId);
    if (list.length === 0) return null; 
    
    return list.map(c => (
        <div key={c.id} className={`mt-[10px] ${depth > 0 ? (isMobile ? 'ml-[10px]' : 'ml-[20px]') : 'ml-0'}`}>
          <div className={`p-[15px] rounded-[8px] ${depth > 0 ? 'bg-[#2a2a2a] border-l-[3px] border-[#F2A900]' : 'bg-[#222] border-l-[3px] border-[#34A853]'}`}>
            
            <div className="flex justify-between mb-[6px]">
              <div className="flex items-center gap-[8px] flex-wrap">
                {depth > 0 && <span className="text-[#F2A900] text-[12px]">↳</span>} 
                <span className={`text-[13px] font-bold ${depth > 0 ? 'text-[#F2A900]' : 'text-[#34A853]'}`}>{c.author}</span>
                <span className="text-[11px] text-[#666]">{formatTimeAgo(c.created_at)}</span>
              </div>
              
              {currentUser && (
                <button 
                  onClick={() => { setReplyingTo(c); setNewComment(''); }} 
                  className="bg-transparent border-none text-[#aaa] text-[12px] cursor-pointer underline hover:text-white transition-colors"
                >
                  답글
                </button>
              )}
            </div>
            
            <div className="text-[14px] text-[#ddd] leading-[1.5] break-all">{c.content}</div>
          </div>
          {renderComments(c.id, depth + 1)}
        </div>
    ));
  };

  return (
    <div className="mt-[40px]">
      {/* 댓글 헤더 */}
      <h3 className="text-[#F2A900] m-0 mb-[20px] font-bold text-[18px]">댓글 ({comments.length})</h3>
      
      {/* 댓글 목록 */}
      <div className="flex flex-col gap-[5px]">
        {renderComments(null)}
      </div>
      
      {/* 댓글 작성 폼 (로그인 시 표시) */}
      {currentUser && (
        <div className="mt-[25px] flex flex-col gap-[10px]">
          {replyingTo && (
            <div className="text-[13px] text-[#F2A900] flex items-center gap-[10px]">
              <span>↳ <strong>{replyingTo.author}</strong>님에게 답글 중</span>
              <button 
                onClick={() => { setReplyingTo(null); setNewComment(''); }} 
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
                placeholder={replyingTo ? "답글 내용을 입력하세요..." : "댓글 입력..."} 
                className="flex-1 h-[60px] bg-transparent border-none resize-none outline-none text-white p-0 m-0" 
                spellCheck={false}
                style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
              />
            </div>

            <button 
              onClick={handleSaveComment} 
              className="bg-[#34A853] border-none rounded-[4px] w-[60px] font-bold text-[13px] hover:bg-[#2a9040] transition-colors cursor-pointer shrink-0"
              style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
            >
              {replyingTo ? '답글' : '등록'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}