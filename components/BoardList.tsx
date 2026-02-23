'use client';

import { Dispatch, SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { Post } from '../types/board'; // Assuming types will be moved

const BOARD_CATEGORIES = ['자유', '듀오/스쿼드 모집', '클럽홍보', '제보/문의'];
const POSTS_PER_PAGE = 10;

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
  posts, boardFilter, totalPosts, page, setPage, searchInput, setSearchInput,
  searchOption, setSearchOption, handleSearch, setIsWriting, isMobile, formatTimeAgo
}: BoardListProps) {

  const router = useRouter();

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {['전체', '추천', ...BOARD_CATEGORIES].map(f => (
            <button key={f} onClick={() => router.push(`/?tab=Board&f=${f}`)} style={{ padding: '6px 12px', borderRadius: '20px', border: '1px solid #333', backgroundColor: boardFilter === f ? '#F2A900' : '#1a1a1a', color: boardFilter === f ? 'black' : '#aaa', whiteSpace: 'nowrap', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' }}>{f}</button>
          ))}
        </div>
        <button onClick={() => setIsWriting(true)} style={{ padding: '8px 16px', backgroundColor: '#34A853', color: 'white', borderRadius: '4px', border: 'none', fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap', cursor: 'pointer' }}>글쓰기</button>
      </div>

      <div style={{ backgroundColor: '#1a1a1a', borderRadius: '8px', border: '1px solid #333', overflow: 'hidden' }}>
        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
             {posts.map(post => (
                <div key={post.id} onClick={() => router.push(`/?tab=Board&f=${boardFilter}&postId=${post.id}`)} style={{ padding: '15px', borderBottom: '1px solid #222', cursor: 'pointer', backgroundColor: post.is_notice ? 'rgba(242, 169, 0, 0.05)' : 'transparent' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontSize: '11px', color: post.is_notice ? '#F2A900' : '#777', fontWeight: 'bold' }}>{post.category}</span>
                      <span style={{ fontSize: '11px', color: '#555' }}>{formatTimeAgo(post.created_at)}</span>
                   </div>
                   <div style={{ fontSize: '15px', fontWeight: 'bold', color: post.is_notice ? '#F2A900' : 'white', marginBottom: '8px', lineHeight: '1.4' }}>
                      {post.title} 
                      {(post.comment_count || 0) > 0 && <span style={{ fontSize: '12px', color: '#aaa', marginLeft: '6px' }}>💬 {post.comment_count}</span>}
                   </div>
                   <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#888' }}>
                      <span>{post.author}</span>
                      <span>조회 {post.views} · 추천 {post.likes}</span>
                   </div>
                </div>
             ))}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead><tr style={{ backgroundColor: '#252525', color: '#888' }}><th style={{ padding: '15px' }}>분류</th><th style={{ padding: '15px' }}>제목</th><th style={{ padding: '15px' }}>글쓴이</th><th style={{ padding: '15px' }}>작성일</th><th style={{ padding: '15px' }}>조회</th><th style={{ padding: '15px' }}>추천</th></tr></thead>
            <tbody>
              {posts.map(post => (
                <tr key={post.id} onClick={() => router.push(`/?tab=Board&f=${boardFilter}&postId=${post.id}`)} style={{ borderBottom: '1px solid #222', cursor: 'pointer', backgroundColor: post.is_notice ? 'rgba(242, 169, 0, 0.05)' : 'transparent' }}>
                  <td style={{ padding: '15px', color: post.is_notice ? '#F2A900' : '#777', fontWeight: 'bold' }}>{post.is_notice ? '공지' : post.category}</td>
                  <td style={{ padding: '15px', color: post.is_notice ? '#F2A900' : 'white', fontWeight: post.is_notice ? 'bold' : 'normal' }}>
                    {post.title}
                    {(post.comment_count || 0) > 0 && <span style={{ marginLeft: '8px', fontSize: '12px', color: '#aaa' }}>💬 {post.comment_count}</span>}
                  </td>
                  <td style={{ padding: '15px', color: '#aaa' }}>{post.author}</td>
                  <td style={{ padding: '15px', color: '#888', fontSize: '13px' }}>{formatTimeAgo(post.created_at)}</td>
                  <td style={{ padding: '15px', color: '#666' }}>{post.views}</td>
                  <td style={{ padding: '15px', color: post.likes >= 5 ? '#F2A900' : '#666', fontWeight: post.likes >= 5 ? 'bold' : 'normal' }}>{post.likes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {posts.length === 0 && <div style={{ padding: '50px', textAlign: 'center', color: '#666' }}>글이 없습니다.</div>}
      </div>

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', gap: '15px', width: '100%' }}>
          <div style={{ display: 'flex', gap: '5px', width: isMobile ? '100%' : 'auto' }}>
            <select value={searchOption} onChange={(e) => setSearchOption(e.target.value)} style={{ padding: '8px', backgroundColor: '#252525', color: '#ddd', border: '1px solid #333', borderRadius: '4px', fontSize: '13px', flexShrink: 0 }}>
              <option value="all">제목+내용</option>
              <option value="title">제목</option>
              <option value="author">글쓴이</option>
            </select>
            <div style={{ display: 'flex', backgroundColor: '#252525', borderRadius: '4px', border: '1px solid #333', padding: '0 8px', alignItems: 'center', flex: 1 }}>
                <input type="text" placeholder="검색..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} style={{ background: 'none', border: 'none', color: 'white', padding: '8px', fontSize: '13px', width: '100%', minWidth: '80px' }} />
                <button onClick={handleSearch} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888' }}>🔍</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button onClick={() => setPage(prev => Math.max(prev - 1, 1))} disabled={page === 1} style={{ padding: '8px 12px', border: '1px solid #333', backgroundColor: '#1a1a1a', color: 'white', borderRadius: '4px', opacity: page === 1 ? 0.5 : 1 }}>&lt;</button>
              {[...Array(Math.ceil(totalPosts / POSTS_PER_PAGE))].map((_, i) => (
                <button key={i} onClick={() => setPage(i + 1)} style={{ padding: '8px 12px', border: '1px solid #333', backgroundColor: page === i + 1 ? '#F2A900' : '#1a1a1a', color: page === i + 1 ? 'black' : 'white', borderRadius: '4px', fontWeight: page === i + 1 ? 'bold' : 'normal', fontSize: '13px' }}>{i + 1}</button>
              ))}
              <button onClick={() => setPage(prev => Math.min(prev + 1, Math.ceil(totalPosts / POSTS_PER_PAGE)))} disabled={page >= Math.ceil(totalPosts / POSTS_PER_PAGE) || totalPosts === 0} style={{ padding: '8px 12px', border: '1px solid #333', backgroundColor: '#1a1a1a', color: 'white', borderRadius: '4px', opacity: (page >= Math.ceil(totalPosts / POSTS_PER_PAGE) || totalPosts === 0) ? 0.5 : 1 }}>&gt;</button>
          </div>
      </div>
    </>
  );
}
