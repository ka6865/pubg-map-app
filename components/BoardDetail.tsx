'use client';

import { useRouter } from 'next/navigation';
import DOMPurify from 'isomorphic-dompurify';
import CommentSection from './CommentSection';
import { Post, Comment } from '../types/board'; // Assuming types will be moved

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
  // DOMPurify를 사용하여 XSS 공격 방지 (HTML 살균)
  return DOMPurify.sanitize(html);
};

export default function BoardDetail({
  selectedPost, comments, currentUser, displayName, isAdmin, isMobile, boardFilter,
  newComment, setNewComment, replyingTo, setReplyingTo, handleSaveComment,
  handleLikePost, handleDeletePost, formatTimeAgo
}: BoardDetailProps) {
  
  const router = useRouter();
  
  const sanitizedContent = sanitizeHTML(selectedPost.content);
  const processedContent = sanitizedContent.replace(
    /<img/gi, 
    '<img style="max-width:100%!important;height:auto!important;display:block;border-radius:8px;margin:10px auto;"'
  );

  return (
    <div style={{ backgroundColor: '#1a1a1a', padding: isMobile ? '15px' : '30px', borderRadius: '8px', border: '1px solid #333', width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      
      <div style={{ marginBottom: '20px' }}>
          <span style={{ color: '#F2A900', fontSize: '13px', fontWeight: 'bold' }}>[{selectedPost.category}]</span>
          <h2 style={{ fontSize: isMobile ? '24px' : '32px', marginTop: '10px', color: 'white', wordBreak: 'break-all' }}>{selectedPost.title}</h2>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <span>글쓴이: {selectedPost.author}</span>
              <span>작성: {formatTimeAgo(selectedPost.created_at)}</span>
              <span>조회: {selectedPost.views}</span>
          </div>
      </div>
      
      <div style={{ borderTop: '1px solid #333', borderBottom: '1px solid #333', padding: '30px 0', minHeight: '200px', color: '#e5e5e5' }}>
          {selectedPost.image_url && !selectedPost.content.includes(selectedPost.image_url) && (
               <img src={selectedPost.image_url} alt="Thumbnail" style={{ maxWidth: '100%', height: 'auto', marginBottom: '20px', display: 'block', borderRadius: '8px' }} />
          )}
          
          <div 
            dangerouslySetInnerHTML={{ __html: processedContent }} 
            style={{ fontSize: '16px', lineHeight: '1.6', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word' }}
          />
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button onClick={() => handleLikePost(selectedPost.id, selectedPost.likes)} style={{ padding: '8px 16px', backgroundColor: '#252525', border: '1px solid #F2A900', color: '#F2A900', borderRadius: '20px', fontSize: '13px' }}>👍 추천 {selectedPost.likes}</button>
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
      
      <div style={{ marginTop: '40px', display: 'flex', gap: '10px' }}>
          <button onClick={() => router.push(`/?tab=Board&f=${boardFilter}`)} style={{ flex: 1, padding: '12px', backgroundColor: '#333', color: 'white', border: 'none', borderRadius: '4px' }}>목록으로</button>
          {(currentUser?.id === selectedPost.user_id || isAdmin) && <button onClick={() => handleDeletePost(selectedPost.id)} style={{ padding: '12px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px' }}>삭제</button>}
      </div>
    </div>
  );
}
