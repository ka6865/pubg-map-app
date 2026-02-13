'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../lib/supabase';
import dynamic from 'next/dynamic';
import 'react-quill-new/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false }) as any;

const ADMIN_EMAIL = "ka6865@gmail.com"; 
const BOARD_CATEGORIES = ['자유', '듀오/스쿼드 모집', '클럽홍보', '제보/문의'];
const POSTS_PER_PAGE = 10; 

interface BoardProps {
  currentUser: any;
  displayName: string;
}

export default function Board({ currentUser, displayName }: BoardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const postIdParam = searchParams?.get('postId');
  const boardFilter = searchParams?.get('f') || '전체';
  
  // 상태 관리
  const [posts, setPosts] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [isWriting, setIsWriting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // 페이지네이션 & 검색 & 모바일 상태
  const [page, setPage] = useState(1);
  const [totalPosts, setTotalPosts] = useState(0);
  const [searchInput, setSearchInput] = useState(''); 
  const [searchQuery, setSearchQuery] = useState(''); 
  const [searchOption, setSearchOption] = useState('all');
  const [isMobile, setIsMobile] = useState(false);

  // 글쓰기 상태
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('자유');
  const [newIsNotice, setNewIsNotice] = useState(false);
  
  // 댓글 상태
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<any | null>(null);

  // 에디터 Ref
  const quillRef = useRef<any>(null);

  const isAdmin = currentUser?.email === ADMIN_EMAIL;
  const lastIncrementedId = useRef<string | null>(null);

  // 📱 모바일 감지
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize(); 
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 작성일 포맷팅
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = (now.getTime() - date.getTime()) / 1000;
    if (diff < 60) return '방금 전';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
    return date.toLocaleDateString();
  };

  // 이미지 업로드 (Supabase Storage)
  const uploadImage = async (file: File) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `${fileName}`;
      const { error } = await supabase.storage.from('images').upload(filePath, file);
      if (error) throw error;
      const { data } = supabase.storage.from('images').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (error: any) {
      alert(`이미지 업로드 실패: ${error.message}`);
      return null;
    }
  };

  // 커스텀 이미지 핸들러
  const imageHandler = () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = async () => {
      const file = input.files ? input.files[0] : null;
      if (file) {
        const url = await uploadImage(file);
        if (url && quillRef.current) {
          const editor = quillRef.current.getEditor();
          const range = editor.getSelection();
          editor.insertEmbed(range ? range.index : editor.getLength(), 'image', url);
        }
      }
    };
  };

  // 에디터 툴바 설정
  const modules = useMemo(() => {
    return {
      toolbar: {
        container: [
          [{ 'header': [1, 2, false] }],
          ['bold', 'italic', 'underline', 'strike', 'blockquote'],
          [{'list': 'ordered'}, {'list': 'bullet'}],
          ['link', 'image'],
          ['clean']
        ],
        handlers: { image: imageHandler }
      }
    };
  }, []);

  // 게시글 목록 가져오기
  const fetchPosts = async () => {
    setIsLoading(true);
    const from = (page - 1) * POSTS_PER_PAGE;
    const to = from + POSTS_PER_PAGE - 1;

    let query = supabase.from('posts').select('*, comments(count)', { count: 'exact' });

    if (boardFilter !== '전체' && boardFilter !== '추천') query = query.eq('category', boardFilter);
    if (boardFilter === '추천') query = query.gte('likes', 5);

    if (searchQuery) {
      if (searchOption === 'title') query = query.ilike('title', `%${searchQuery}%`);
      else if (searchOption === 'author') query = query.ilike('author', `%${searchQuery}%`);
      else query = query.or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%`);
    }

    const { data, count, error } = await query
      .order('is_notice', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (!error && data) {
      const postsWithCount = data.map((post: any) => ({
        ...post,
        comment_count: post.comments && post.comments[0] ? post.comments[0].count : 0
      }));
      setPosts(postsWithCount);
      setTotalPosts(count || 0);
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchPosts(); }, [page, boardFilter, searchQuery]);

  useEffect(() => {
    if (postIdParam) {
      const post = posts.find(p => p.id.toString() === postIdParam);
      if (post) {
        setSelectedPost(post);
        fetchComments(post.id);
        if (lastIncrementedId.current !== postIdParam) {
           incrementViews(post.id, post.views);
           lastIncrementedId.current = postIdParam;
        }
      } else {
        fetchSinglePost(postIdParam);
      }
    } else {
      setSelectedPost(null); setComments([]); setReplyingTo(null); lastIncrementedId.current = null;
    }
  }, [postIdParam, posts]);

  const fetchSinglePost = async (id: string) => {
      const { data } = await supabase.from('posts').select('*').eq('id', id).single();
      if(data) { setSelectedPost(data); fetchComments(data.id); }
  };

  const fetchComments = async (postId: number) => {
    const { data } = await supabase.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
    if (data) setComments(data);
  };

  const incrementViews = async (postId: number, currentViews: number) => {
    await supabase.from('posts').update({ views: currentViews + 1 }).eq('id', postId);
  };

  // 게시글 저장 (본문 첫 이미지 추출)
  const handleSavePost = async () => {
    if (!newTitle.trim() || newContent.trim() === '<p><br></p>' || !currentUser) return alert('내용을 입력해주세요.');
    setIsLoading(true);
    
    let finalImageUrl = '';
    const imgTagRegex = /<img[^>]+src="([^">]+)"/;
    const match = newContent.match(imgTagRegex);
    if (match && match[1]) finalImageUrl = match[1];

    const { error } = await supabase.from('posts').insert([{ 
      title: newTitle, content: newContent, author: displayName,
      user_id: currentUser.id, category: newCategory, 
      image_url: finalImageUrl,
      is_notice: isAdmin ? newIsNotice : false
    }]);

    if (!error) {
      setIsWriting(false); setNewTitle(''); setNewContent('');
      setPage(1); fetchPosts();
    } else alert('저장 실패: ' + error.message);
    setIsLoading(false);
  };

  const handleSaveComment = async () => {
    if (!newComment.trim() || !currentUser) return;
    const { error } = await supabase.from('comments').insert([{
      post_id: selectedPost.id, user_id: currentUser.id, author: displayName, content: newComment,
      parent_id: replyingTo ? replyingTo.id : null
    }]);
    if (!error) {
      const targetUserId = replyingTo ? replyingTo.user_id : selectedPost.user_id;
      if (targetUserId !== currentUser.id) {
        await supabase.from('notifications').insert([{
          user_id: targetUserId, sender_id: currentUser.id, sender_name: displayName, type: 'comment', post_id: selectedPost.id
        }]);
      }
      setNewComment(''); setReplyingTo(null); fetchComments(selectedPost.id);
      fetchPosts(); // 목록의 댓글 수 동기화
    }
  };

  const handleLikePost = async (postId: number, currentLikes: number) => {
    if (!currentUser) return alert('로그인 필요!');
    const { data } = await supabase.from('post_likes').select('*').eq('post_id', postId).eq('user_id', currentUser.id).single();
    if (data) return alert('이미 추천함!');
    await supabase.from('post_likes').insert([{ post_id: postId, user_id: currentUser.id }]);
    await supabase.from('posts').update({ likes: currentLikes + 1 }).eq('id', postId);
    if (selectedPost?.id === postId) setSelectedPost({ ...selectedPost, likes: currentLikes + 1 });
    fetchPosts();
    alert('추천 완료!');
  };

  const handleDeletePost = async (postId: number) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await supabase.from('posts').delete().eq('id', postId);
    alert('삭제됨');
    router.push('/?tab=Board');
    fetchPosts();
  };

  const handleSearch = () => { setPage(1); setSearchQuery(searchInput); };

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
          <div style={{ fontSize: '14px', color: '#ddd', lineHeight: '1.5' }}>{c.content}</div>
        </div>
        {renderComments(c.id, depth + 1)}
      </div>
    ));
  };

  if (isWriting) {
    return (
      <div style={{ backgroundColor: '#1a1a1a', padding: isMobile ? '15px' : '30px', borderRadius: '8px', border: '1px solid #333' }}>
        <h2 style={{ marginBottom: '20px', color: '#F2A900', fontSize: '20px', fontWeight: 'bold' }}>새 게시글 작성</h2>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px', marginBottom: '15px' }}>
          <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={{ padding: '10px', backgroundColor: '#252525', color: 'white', border: '1px solid #333', borderRadius: '4px' }}>{BOARD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
          <input type="text" placeholder="제목을 입력하세요" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ flex: 1, padding: '10px', backgroundColor: '#252525', color: 'white', border: '1px solid #333', borderRadius: '4px', fontSize: '16px' }} />
        </div>
        <div style={{ marginBottom: '50px', backgroundColor: 'white', color: 'black', borderRadius: '4px', overflow: 'hidden' }}>
          <ReactQuill ref={quillRef} theme="snow" value={newContent} onChange={setNewContent} modules={modules} style={{ height: '350px' }} />
        </div>
        {isAdmin && <label style={{ display: 'flex', gap: '8px', marginBottom: '20px', color: '#F2A900' }}><input type="checkbox" checked={newIsNotice} onChange={(e) => setNewIsNotice(e.target.checked)} /> 공지사항</label>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={() => setIsWriting(false)} style={{ padding: '10px 20px', backgroundColor: '#333', color: '#ccc', borderRadius: '4px' }}>취소</button>
          <button onClick={handleSavePost} disabled={isLoading} style={{ padding: '10px 30px', backgroundColor: '#F2A900', color: 'black', fontWeight: 'bold', borderRadius: '4px' }}>{isLoading ? '등록 중...' : '등록하기'}</button>
        </div>
      </div>
    );
  }

  if (selectedPost) {
    return (
      <div style={{ backgroundColor: '#1a1a1a', padding: isMobile ? '15px' : '30px', borderRadius: '8px', border: '1px solid #333' }}>
        <div style={{ marginBottom: '20px' }}>
            <span style={{ color: '#F2A900', fontSize: '13px', fontWeight: 'bold' }}>[{selectedPost.category}]</span>
            <h2 style={{ fontSize: isMobile ? '24px' : '32px', marginTop: '10px', color: 'white' }}>{selectedPost.title}</h2>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <span>글쓴이: {selectedPost.author}</span>
                <span>작성: {formatTimeAgo(selectedPost.created_at)}</span>
                <span>조회: {selectedPost.views}</span>
            </div>
        </div>
        <div style={{ borderTop: '1px solid #333', borderBottom: '1px solid #333', padding: '30px 0', minHeight: '200px', color: '#e5e5e5', overflowX: 'auto' }}>
            {selectedPost.image_url && !selectedPost.content.includes(selectedPost.image_url) && (
                 <img src={selectedPost.image_url} alt="Thumbnail" style={{ maxWidth: '100%', maxHeight: '400px', marginBottom: '20px', display: 'block' }} />
            )}
            <div dangerouslySetInnerHTML={{ __html: selectedPost.content }} style={{ whiteSpace: 'pre-wrap', fontSize: '16px', lineHeight: '1.6' }} />
        </div>
        <div style={{ marginTop: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ color: '#F2A900', margin: 0 }}>댓글 ({comments.length})</h3>
                <button onClick={() => handleLikePost(selectedPost.id, selectedPost.likes)} style={{ padding: '8px 16px', backgroundColor: '#252525', border: '1px solid #F2A900', color: '#F2A900', borderRadius: '20px', fontSize: '13px' }}>👍 추천 {selectedPost.likes}</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>{renderComments(null)}</div>
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
        <div style={{ marginTop: '40px', display: 'flex', gap: '10px' }}>
            <button onClick={() => router.push(`/?tab=Board&f=${boardFilter}`)} style={{ flex: 1, padding: '12px', backgroundColor: '#333', color: 'white', border: 'none', borderRadius: '4px' }}>목록으로</button>
            {(currentUser?.id === selectedPost.user_id || isAdmin) && <button onClick={() => handleDeletePost(selectedPost.id)} style={{ padding: '12px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px' }}>삭제</button>}
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {['전체', '추천', ...BOARD_CATEGORIES].map(f => (
            <button key={f} onClick={() => { setPage(1); router.push(`/?tab=Board&f=${f}`); }} style={{ padding: '6px 12px', borderRadius: '20px', border: '1px solid #333', backgroundColor: boardFilter === f ? '#F2A900' : '#1a1a1a', color: boardFilter === f ? 'black' : '#aaa', whiteSpace: 'nowrap', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' }}>{f}</button>
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
                      {post.comment_count > 0 && <span style={{ fontSize: '12px', color: '#aaa', marginLeft: '6px' }}>💬 {post.comment_count}</span>}
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
                    {post.comment_count > 0 && <span style={{ marginLeft: '8px', fontSize: '12px', color: '#aaa' }}>💬 {post.comment_count}</span>}
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

      {/* 하단 컨트롤 (검색 & 페이지네이션) */}
      <div style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginTop: '20px', 
        gap: '15px',
        width: '100%' 
      }}>
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