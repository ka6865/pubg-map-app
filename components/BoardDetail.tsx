'use client';

import { useRouter } from 'next/navigation';
import DOMPurify from 'isomorphic-dompurify';
import CommentSection from './CommentSection';
import { Post, Comment } from '../types/board';

interface BoardDetailProps {
  selectedPost: Post;
  comments: Comment[];
  currentUser: any;
  displayName: string;
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
  formatTimeAgo: (dateString: string) => string;
}

const sanitizeHTML = (html: string) => {
  if (!html) return '';
  return DOMPurify.sanitize(html);
};

export default function BoardDetail({
  selectedPost, comments, currentUser, displayName, isAdmin, isMobile, boardFilter,
  newComment, setNewComment, replyingTo, setReplyingTo, handleSaveComment,
  handleLikePost, handleDeletePost, formatTimeAgo
}: BoardDetailProps) {
  
  const router = useRouter();
  
  // 🛡️ 기절 방지 방패 유지 (|| '')
  const sanitizedContent = sanitizeHTML(selectedPost.content || '');
  const processedContent = sanitizedContent.replace(
    /<img/gi, 
    '<img style="max-width:100%!important;height:auto!important;display:block;border-radius:8px;margin:10px auto;"'
  );

  return (
    <div className={`bg-[#1a1a1a] rounded-[8px] border border-[#333] w-full box-border overflow-x-hidden ${isMobile ? 'p-[15px]' : 'p-[30px]'}`}>
      
      <div className="mb-[20px]">
          <span className="text-[#F2A900] text-[13px] font-bold">[{selectedPost.category}]</span>
          <h2 className={`mt-[10px] text-white break-all font-bold ${isMobile ? 'text-[24px]' : 'text-[32px]'}`}>{selectedPost.title}</h2>
          <div className="text-[12px] text-[#888] mt-[12px] flex gap-[10px] flex-wrap">
              <span>글쓴이: {selectedPost.author}</span>
              <span>작성: {formatTimeAgo(selectedPost.created_at)}</span>
              <span>조회: {selectedPost.views}</span>
          </div>
      </div>
      
      <div className="border-y border-[#333] py-[30px] min-h-[200px] text-[#e5e5e5]">
          {/* 🛡️ 기절 방지 방패 유지 (|| '') */}
          {selectedPost.image_url && !(selectedPost.content || '').includes(selectedPost.image_url) && (
               <img src={selectedPost.image_url} alt="Thumbnail" className="max-w-full h-auto mb-[20px] block rounded-[8px]" />
          )}
          
          <div 
            dangerouslySetInnerHTML={{ __html: processedContent }} 
            className="text-[16px] leading-[1.6] whitespace-normal break-words"
          />
      </div>
      
      <div className="flex justify-end mt-[20px]">
          <button 
            onClick={() => handleLikePost(selectedPost.id, selectedPost.likes)} 
            className="px-[16px] py-[8px] bg-[#252525] border border-[#F2A900] text-[#F2A900] rounded-[20px] text-[13px] hover:bg-[#F2A900] hover:text-black transition-colors"
          >
            👍 추천 {selectedPost.likes}
          </button>
      </div>

      <CommentSection 
        comments={comments}
        selectedPost={selectedPost}
        currentUser={currentUser}
        displayName={displayName}
        newComment={newComment}
        setNewComment={setNewComment}
        replyingTo={replyingTo}
        setReplyingTo={setReplyingTo}
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