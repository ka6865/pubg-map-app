'use client'; 

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { validatePost, extractImageUrl, sanitizeTitle } from '../lib/board-utils';
import dynamic from 'next/dynamic';
import 'react-quill-new/dist/quill.snow.css';
import DOMPurify from 'isomorphic-dompurify';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false }) as any;

// 게시판 카테고리 및 페이지당 게시글 수 설정
const BOARD_CATEGORIES = ['자유', '듀오/스쿼드 모집', '클럽홍보', '제보/문의'];
const POSTS_PER_PAGE = 10; 

// HTML 정화 함수 (XSS 방지)
const sanitizeHTML = (html: string) => {
  if (!html) return '';
  return DOMPurify.sanitize(html);
};

interface Comment { id: number; post_id: number; user_id: string; author: string; content: string; created_at: string; parent_id: number | null; }
interface Post { id: number; title: string; content: string; author: string; user_id: string; category: string; image_url: string; is_notice: boolean; created_at: string; views: number; likes: number; comment_count?: number; comments?: { count: number }[]; }
interface BoardProps { currentUser: any; displayName: string; isAdmin: boolean; }

import BoardList from './BoardList';
import BoardDetail from './BoardDetail';
import BoardWrite from './BoardWrite';

export default function Board({ currentUser, displayName, isAdmin }: BoardProps) {
  const router = useRouter(); 
  const searchParams = useSearchParams(); 
  
  // URL 파라미터에서 게시글 ID와 필터 가져오기
  const postIdParam = searchParams?.get('postId'); 
  const boardFilter = searchParams?.get('f') || '전체'; 
  
  // 상태 관리: 게시글, 댓글, 선택된 글, 작성 모드, 로딩
  const [posts, setPosts] = useState<Post[]>([]); 
  const [comments, setComments] = useState<Comment[]>([]); 
  const [selectedPost, setSelectedPost] = useState<Post | null>(null); 
  const [isWriting, setIsWriting] = useState(false); 
  const [isLoading, setIsLoading] = useState(false); 
  
  const [page, setPage] = useState(1); 
  const [totalPosts, setTotalPosts] = useState(0); 
  const [searchInput, setSearchInput] = useState(''); 
  const [searchQuery, setSearchQuery] = useState(''); 
  const [searchOption, setSearchOption] = useState('all'); 
  const [isMobile, setIsMobile] = useState(false); 

  // 글 작성/수정 관련 상태
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('자유');
  const [newIsNotice, setNewIsNotice] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [editingPostId, setEditingPostId] = useState<number | null>(null);

  // 모바일 환경 감지
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize(); 
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 필터나 검색어 변경 시 1페이지로 초기화
  useEffect(() => {
    setPage(1);
  }, [boardFilter, searchQuery]);

  // 시간 포맷팅 함수 (예: 방금 전, 1시간 전)
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

  // 게시글 목록 불러오기 (페이지네이션, 필터, 검색 적용)
  const fetchPosts = async () => {
    setIsLoading(true);
    const from = (page - 1) * POSTS_PER_PAGE;
    const to = from + POSTS_PER_PAGE - 1;

    let query = supabase.from('posts')
      .select('id, title, author, user_id, category, image_url, is_notice, created_at, views, likes, comments(count)', { count: 'exact' });

    if (boardFilter !== '전체' && boardFilter !== '추천') query = query.eq('category', boardFilter);
    if (boardFilter === '추천') query = query.gte('likes', 5);

    if (searchQuery) {
      if (searchOption === 'title') query = query.ilike('title', `%${searchQuery}%`);
      else if (searchOption === 'author') query = query.ilike('author', `%${searchQuery}%`);
      else query = query.or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%`);
    }

    const { data, count, error } = await query.order('is_notice', { ascending: false }).order('created_at', { ascending: false }).range(from, to);

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

  // 데이터 로드 트리거
  useEffect(() => { 
    fetchPosts(); 
  }, [page, boardFilter, searchQuery, displayName]);

  // URL 파라미터에 따른 단일 게시글 로드 처리
  useEffect(() => {
    if (postIdParam) {
      fetchSinglePost(postIdParam); 
    } else {
      setSelectedPost(null); setComments([]); setReplyingTo(null);
    }
  }, [postIdParam]);

  // 단일 게시글 상세 정보 불러오기
  const fetchSinglePost = async (id: string) => {
      const postPromise = supabase.from('posts').select('*').eq('id', id).single();
      const commentPromise = supabase.from('comments').select('*').eq('post_id', id).order('created_at', { ascending: true });

      const [postResult, commentResult] = await Promise.all([postPromise, commentPromise]);

      if(postResult.data) { 
        setSelectedPost(postResult.data); 
        
        const viewedKey = `viewed_post_${postResult.data.id}`;
        if (!sessionStorage.getItem(viewedKey)) {
          incrementViews(postResult.data.id, postResult.data.views);
          sessionStorage.setItem(viewedKey, 'true');
        }
      }
      
      if(commentResult.data) {
        setComments(commentResult.data);
      }
  };

  // 댓글 불러오기
  const fetchComments = async (postId: number) => {
    const { data } = await supabase.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
    if (data) setComments(data);
  };

  // 조회수 증가 처리
  const incrementViews = async (postId: number, currentViews: number) => {
    await supabase.from('posts').update({ views: currentViews + 1 }).eq('id', postId);
  };

  // 게시글 저장 (작성 및 수정)
  const handleSavePost = async () => {
    const validationError = validatePost(newTitle, newContent, currentUser);
    if (validationError) {
      return alert(validationError);
    }

    setIsLoading(true);
    const trimmedTitle = sanitizeTitle(newTitle);
    const finalImageUrl = extractImageUrl(newContent);

    // 💡 수정 모드일 때는 기존 글을 업데이트
    if (editingPostId) {
      
      // 기존 본문과 새 본문을 비교해서 "지워진 이미지"를 찾아 스토리지에서 완벽 삭제!
      if (selectedPost && selectedPost.content) {
        const imgRegex = /<img[^>]+src\s*=\s*["']?([^"'\s>]+)["']?/g;
        // 1. 기존 본문에 있던 이미지 주소들 수집
        const oldImages = [...selectedPost.content.matchAll(imgRegex)].map(m => m[1]);
        // 2. 현재(수정된) 본문에 있는 이미지 주소들 수집
        const newImages = [...newContent.matchAll(imgRegex)].map(m => m[1]);
        // 3. 기존에는 있었는데 새 본문에는 없는 주소 찾기 (삭제된 이미지)
        const deletedImages = oldImages.filter(src => !newImages.includes(src));
        
        const imagePathsToDelete = deletedImages.map(src => {
          if (src.includes('/storage/v1/object/public/images/')) {
            const path = src.split('/storage/v1/object/public/images/')[1];
            return path ? decodeURIComponent(path) : null;
          }
          return null;
        }).filter((path): path is string => path !== null);

        // 4. 지워진 이미지가 있다면 스토리지 서버에서도 영구 삭제
        if (imagePathsToDelete.length > 0) {
          await supabase.storage.from('images').remove(imagePathsToDelete);
        }
      }

      const { error } = await supabase.from('posts').update({ 
        title: trimmedTitle, 
        content: newContent, 
        category: newCategory, 
        image_url: finalImageUrl,
        is_notice: isAdmin ? newIsNotice : false
      }).eq('id', editingPostId);

      if (!error) {
        setIsWriting(false); 
        setEditingPostId(null);
        setNewTitle(''); setNewContent(''); 
        fetchPosts(); 
        fetchSinglePost(String(editingPostId)); 
      } else alert('수정 실패: ' + error.message);
      
    } else {
      // 기존의 새 글 작성 로직 (INSERT)
      const { error } = await supabase.from('posts').insert([{ 
        title: trimmedTitle, 
        content: newContent, 
        author: displayName,
        user_id: currentUser.id, 
        category: newCategory, 
        image_url: finalImageUrl,
        is_notice: isAdmin ? newIsNotice : false
      }]);

      if (!error) {
        setIsWriting(false); setNewTitle(''); setNewContent(''); 
        setPage(1); 
        fetchPosts(); 
      } else alert('저장 실패: ' + error.message);
    }
    
    setIsLoading(false);
  };

  // 댓글 저장
  const handleSaveComment = async () => {
    if (!newComment.trim() || !currentUser || !selectedPost) return;
  
    const finalComment = replyingTo ? `@${replyingTo.author} ${newComment}` : newComment;

    const { error } = await supabase.from('comments').insert([{
      post_id: selectedPost.id, user_id: currentUser.id, author: displayName, content: finalComment,
      parent_id: replyingTo ? replyingTo.id : null
    }]);

    if (!error) {
      const targetUserId = replyingTo ? replyingTo.user_id : selectedPost.user_id;
      if (targetUserId !== currentUser.id) {
        
        // 알림 미리보기 로직 
        const notiType = replyingTo ? 'reply' : 'comment';
        const previewText = replyingTo ? replyingTo.content : selectedPost.title;

        await supabase.from('notifications').insert([{
          user_id: targetUserId, sender_id: currentUser.id, sender_name: displayName, type: notiType, post_id: selectedPost.id, preview_text: previewText
        }]);
      }
      setNewComment(''); setReplyingTo(null); fetchComments(selectedPost.id); fetchPosts();
    }
  };

  // 게시글 추천 처리
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

  // 게시글 삭제 처리 (이미지 파일 포함)
  const handleDeletePost = async (postId: number) => {
    if (!confirm('삭제하시겠습니까?')) return;

    try {
      const { data: postData, error: fetchError } = await supabase.from('posts').select('content').eq('id', postId).single();
      if (fetchError) throw fetchError;

      if (postData?.content) {
        const imgRegex = /<img[^>]+src\s*=\s*["']?([^"'\s>]+)["']?/g;
        const matches = [...postData.content.matchAll(imgRegex)];
        
        const imagePaths = matches.map(match => {
          const src = match[1];
          if (src.includes('/storage/v1/object/public/images/')) {
            const path = src.split('/storage/v1/object/public/images/')[1];
            return path ? decodeURIComponent(path) : null;
          }
          return null;
        }).filter((path): path is string => path !== null);

        if (imagePaths.length > 0) {
          await supabase.storage.from('images').remove(imagePaths); 
        }
      }

      await supabase.from('posts').delete().eq('id', postId);
      alert('삭제됨');
      router.push('/?tab=Board');
      fetchPosts();
    } catch (error: any) {
      alert('삭제 실패: ' + error.message);
    }
  };

  // 검색 실행 핸들러
  const handleSearch = () => { setPage(1); setSearchQuery(searchInput); };

  // 렌더링 분기: 글쓰기 모드
  if (isWriting) {
    // 에디터에 지금이 수정 상태인지 아닌지(isEditing) 전달
    return <BoardWrite newTitle={newTitle} setNewTitle={setNewTitle} newContent={newContent} setNewContent={setNewContent} newCategory={newCategory} setNewCategory={setNewCategory} newIsNotice={newIsNotice} setNewIsNotice={setNewIsNotice} handleSavePost={handleSavePost} setIsWriting={setIsWriting} isAdmin={isAdmin} isLoading={isLoading} isMobile={isMobile} isEditing={!!editingPostId} />;
  }

  // 렌더링 분기: 상세 보기 모드
  if (selectedPost) {
    // 상세 화면에서 수정 버튼을 누르면 제목/내용을 싹 다 채워 넣고 에디터 창을 열기
    return <BoardDetail selectedPost={selectedPost} comments={comments} currentUser={currentUser} displayName={displayName} isAdmin={isAdmin} isMobile={isMobile} boardFilter={boardFilter} newComment={newComment} setNewComment={setNewComment} replyingTo={replyingTo} setReplyingTo={setReplyingTo} handleSaveComment={handleSaveComment} handleLikePost={handleLikePost} handleDeletePost={handleDeletePost} formatTimeAgo={formatTimeAgo} 
      handleEditClick={() => {
        setEditingPostId(selectedPost.id);          
        setNewTitle(selectedPost.title);            
        setNewContent(selectedPost.content || '');        
        setNewCategory(selectedPost.category);      
        setNewIsNotice(selectedPost.is_notice);     
        setIsWriting(true);                         
      }} 
    />;
  }

  // 렌더링 분기: 목록 보기 모드
  return <BoardList posts={posts} boardFilter={boardFilter} totalPosts={totalPosts} page={page} setPage={setPage} searchInput={searchInput} setSearchInput={setSearchInput} searchOption={searchOption} setSearchOption={setSearchOption} handleSearch={handleSearch} isMobile={isMobile} formatTimeAgo={formatTimeAgo} 
    setIsWriting={(v) => {
      //  새 글 쓰기를 누르면 혹시 남아있던 수정 기록을 싹 비우기
      if (v) {
        setEditingPostId(null);
        setNewTitle('');
        setNewContent('');
        setNewCategory('자유');
        setNewIsNotice(false);
      }
      setIsWriting(v);
    }} 
  />;
}