'use client';

import { Post, Comment } from '../types/board'; 

// 📦 부모한테 받아올 데이터 설명서
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

  // 💬 [핵심 마법] 대댓글을 무한 계단처럼 들여쓰기해서 그려주는 똑똑한 함수예요!
  const renderComments = (parentId: number | null = null, depth = 0) => {
    // 1. "누구 밑에 달린 댓글인가?" 찾기
    const list = comments.filter(c => c.parent_id === parentId);
    if (list.length === 0) return null; // 없으면 그만!
    
    // 2. 찾은 댓글들을 하나씩 예쁘게 네모 상자로 포장해서 그려줘요.
    return list.map(c => (
        <div 
          key={c.id} 
          className={`mt-[10px] ${depth > 0 ? (isMobile ? 'ml-[10px]' : 'ml-[20px]') : 'ml-0'}`} // 대댓글이면 왼쪽으로 살짝 밀어줌
        >
          {/* 댓글 한 개의 상자 모양 */}
          <div className={`p-[15px] rounded-[8px] ${depth > 0 ? 'bg-[#2a2a2a] border-l-[3px] border-[#F2A900]' : 'bg-[#222] border-l-[3px] border-[#34A853]'}`}>
            
            <div className="flex justify-between mb-[6px]">
              <div className="flex items-center gap-[8px] flex-wrap">
                {depth > 0 && <span className="text-[#F2A900] text-[12px]">↳</span>} {/* 대댓글 화살표 */}
                <span className={`text-[13px] font-bold ${depth > 0 ? 'text-[#F2A900]' : 'text-[#34A853]'}`}>{c.author}</span>
                <span className="text-[11px] text-[#666]">{formatTimeAgo(c.created_at)}</span>
              </div>
              
              {/* 로그인한 사람만 '답글' 버튼을 누를 수 있어요 */}
              {currentUser && (
                <button 
                  onClick={() => { setReplyingTo(c); setNewComment(`@${c.author} `); }} // 답글 버튼 누르면 누구한테 쓰는지 표시해줌
                  className="bg-transparent border-none text-[#aaa] text-[12px] cursor-pointer underline hover:text-white transition-colors"
                >
                  답글
                </button>
              )}
            </div>
            
            {/* 진짜 댓글 내용! */}
            <div className="text-[14px] text-[#ddd] leading-[1.5] break-all">{c.content}</div>
          </div>
          
          {/* 3. 혹시 이 밑에 또 대댓글이 있는지 확인하고 그려줘! (무한 반복 마법) */}
          {renderComments(c.id, depth + 1)}
        </div>
    ));
  };

  return (
    <div className="mt-[40px]">
      <h3 className="text-[#F2A900] m-0 mb-[20px] font-bold text-[18px]">댓글 ({comments.length})</h3>
      
      {/* 위에서 만든 마법 함수를 실행해서 댓글들을 쫙 보여줘요 */}
      <div className="flex flex-col gap-[5px]">
        {renderComments(null)}
      </div>
      
      {/* ✍️ 새 댓글 쓰는 입력창 (로그인한 사람만 보여요!) */}
      {currentUser && (
        <div className="mt-[25px] flex flex-col gap-[10px]">
          {/* 누군가에게 답글을 달고 있을 때 뜨는 안내문구 */}
          {replyingTo && (
            <div className="text-[13px] text-[#F2A900] flex items-center gap-[10px]">
              <span>↳ <strong>{replyingTo.author}</strong>님에게 답글 중</span>
              <button 
                onClick={() => { setReplyingTo(null); setNewComment(''); }} // 취소 누르면 그냥 일반 댓글로 바뀜
                className="bg-transparent border-none text-[#666] cursor-pointer text-[12px] hover:text-white transition-colors"
              >
                취소
              </button>
            </div>
          )}
          
          <div className="flex gap-[8px]">
            {/* 글씨 치는 네모 상자 */}
            <textarea 
              value={newComment} 
              onChange={(e) => setNewComment(e.target.value)} 
              placeholder={replyingTo ? "답글 입력..." : "댓글 입력..."} 
              className="flex-1 h-[60px] p-[10px] bg-[#111] text-white border border-[#333] rounded-[4px] resize-none outline-none focus:border-[#F2A900] transition-colors" 
            />
            {/* 등록 버튼! */}
            <button 
              onClick={handleSaveComment} 
              className="bg-[#34A853] text-white border-none rounded-[4px] w-[60px] font-bold text-[13px] hover:bg-[#2a9040] transition-colors cursor-pointer"
            >
              {replyingTo ? '답글' : '등록'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}