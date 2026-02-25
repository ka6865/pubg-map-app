'use client';

import { useRouter } from 'next/navigation';
import DOMPurify from 'isomorphic-dompurify'; // 나쁜 코드를 소독해주는 약
import CommentSection from './CommentSection'; // 댓글창 컴포넌트 불러오기
import { Post, Comment } from '../types/board';

// 📦 넘겨받은 데이터들의 설명서
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

// 🛡️ 나쁜 해커가 글 내용에 이상한 코드를 섞었을까 봐 소독약을 뿌려주는 함수예요!
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
  
  // 1단계: 글 내용을 소독합니다. (기절 방지 방패: 내용이 비어있으면 '' 빈칸으로 처리)
  const sanitizedContent = sanitizeHTML(selectedPost.content || '');
  
  // 2단계: 폰으로 볼 때 사진이 화면 밖으로 튀어나가지 않게 스타일을 억지로 입혀주는 마법이에요.
  const processedContent = sanitizedContent.replace(
    /<img/gi, 
    '<img style="max-width:100%!important;height:auto!important;display:block;border-radius:8px;margin:10px auto;"'
  );

  return (
    <div className={`bg-[#1a1a1a] rounded-[8px] border border-[#333] w-full box-border overflow-x-hidden ${isMobile ? 'p-[15px]' : 'p-[30px]'}`}>
      
      {/* 🏷️ 글 제목이랑 작성자 정보가 나오는 윗부분 */}
      <div className="mb-[20px]">
          <span className="text-[#F2A900] text-[13px] font-bold">[{selectedPost.category}]</span>
          <h2 className={`mt-[10px] text-white break-all font-bold ${isMobile ? 'text-[24px]' : 'text-[32px]'}`}>{selectedPost.title}</h2>
          <div className="text-[12px] text-[#888] mt-[12px] flex gap-[10px] flex-wrap">
              <span>글쓴이: {selectedPost.author}</span>
              <span>작성: {formatTimeAgo(selectedPost.created_at)}</span>
              <span>조회: {selectedPost.views}</span>
          </div>
      </div>
      
      {/* 📖 글 내용(본문)이 나오는 중간 부분 */}
      <div className="border-y border-[#333] py-[30px] min-h-[200px] text-[#e5e5e5]">
          {/* 에디터 밖에서 올린 썸네일 사진이 있다면 맨 위에 띄워줘요 */}
          {selectedPost.image_url && !(selectedPost.content || '').includes(selectedPost.image_url) && (
               <img src={selectedPost.image_url} alt="Thumbnail" className="max-w-full h-auto mb-[20px] block rounded-[8px]" />
          )}
          
          {/* 소독된 HTML 코드(글 내용)를 진짜 화면으로 바꿔주는 곳이에요 */}
          <div 
            dangerouslySetInnerHTML={{ __html: processedContent }} 
            className="text-[16px] leading-[1.6] whitespace-normal break-words"
          />
      </div>
      
      {/* 👍 추천 버튼 */}
      <div className="flex justify-end mt-[20px]">
          <button 
            onClick={() => handleLikePost(selectedPost.id, selectedPost.likes)} 
            className="px-[16px] py-[8px] bg-[#252525] border border-[#F2A900] text-[#F2A900] rounded-[20px] text-[13px] hover:bg-[#F2A900] hover:text-black transition-colors"
          >
            👍 추천 {selectedPost.likes}
          </button>
      </div>

      {/* 💬 아래에 댓글창 컴포넌트를 찰칵! 조립해 줍니다. */}
      <CommentSection 
        comments={comments} selectedPost={selectedPost} currentUser={currentUser} displayName={displayName}
        newComment={newComment} setNewComment={setNewComment} replyingTo={replyingTo} setReplyingTo={setReplyingTo}
        handleSaveComment={handleSaveComment} isMobile={isMobile} formatTimeAgo={formatTimeAgo}
      />
      
      {/* 🔙 목록으로 돌아가거나 삭제하는 하단 버튼들 */}
      <div className="mt-[40px] flex gap-[10px]">
          <button 
            onClick={() => router.push(`/?tab=Board&f=${boardFilter}`)} 
            className="flex-1 p-[12px] bg-[#333] text-white border-none rounded-[4px] hover:bg-[#444] transition-colors text-[14px]"
          >
            목록으로
          </button>
          
          {/* 내가 쓴 글이거나 내가 관리자일 때만 '삭제' 버튼이 보여요! */}
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