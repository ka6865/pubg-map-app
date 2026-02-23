'use client';

import { Post, Comment } from '../types/board'; // Assuming types are moved to a separate file

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

  const renderComments = (parentId: number | null = null, depth = 0) => {
    const list = comments.filter(c => c.parent_id === parentId);
    if (list.length === 0) return null;
    return list.map(c => (
      <div key={c.id} style={{ marginLeft: depth > 0 ? (isMobile ? '10px' : '20px') : '0', marginTop: '10px' }}>
        <div style={{ padding: '15px', backgroundColor: depth > 0 ? '#2a2a2a' : '#222', borderRadius: '8px', borderLeft: depth > 0 ? '3px solid #F2A900' : '3px solid #34A853' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {depth > 0 && <span style={{ color: '#F2A900', fontSize: '12px' }}>↳</span>}
              <span style={{ fontSize: '13px', color: depth > 0 ? '#F2A900' : '#34A853', fontWeight: 'bold' }}>{c.author}</span>
              <span style={{ fontSize: '11px', color: '#666' }}>{formatTimeAgo(c.created_at)}</span>
            </div>
            {currentUser && (
              <button onClick={() => { setReplyingTo(c); setNewComment(`@${c.author} `); }} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>답글</button>
            )}
          </div>
          <div style={{ fontSize: '14px', color: '#ddd', lineHeight: '1.5', wordBreak: 'break-all' }}>{c.content}</div>
        </div>
        {renderComments(c.id, depth + 1)}
      </div>
    ));
  };

  return (
    <div style={{ marginTop: '40px' }}>
      <h3 style={{ color: '#F2A900', margin: '0 0 20px 0' }}>댓글 ({comments.length})</h3>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {renderComments(null)}
      </div>
      
      {currentUser && (
        <div style={{ marginTop: '25px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {replyingTo && (
            <div style={{ fontSize: '13px', color: '#F2A900', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>↳ <strong>{replyingTo.author}</strong>님에게 답글 중</span>
              <button onClick={() => { setReplyingTo(null); setNewComment(''); }} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '12px' }}>취소</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder={replyingTo ? "답글 입력..." : "댓글 입력..."} style={{ flex: 1, height: '60px', padding: '10px', backgroundColor: '#111', color: 'white', border: '1px solid #333', borderRadius: '4px', resize: 'none' }} />
            <button onClick={handleSaveComment} style={{ backgroundColor: '#34A853', color: 'white', border: 'none', borderRadius: '4px', width: '60px', fontWeight: 'bold', fontSize: '13px' }}>{replyingTo ? '답글' : '등록'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
