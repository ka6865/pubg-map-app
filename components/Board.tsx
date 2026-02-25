'use client'; 

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../lib/supabase';
import dynamic from 'next/dynamic';
import 'react-quill-new/dist/quill.snow.css';
import DOMPurify from 'isomorphic-dompurify';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false }) as any;

const BOARD_CATEGORIES = ['자유', '듀오/스쿼드 모집', '클럽홍보', '제보/문의'];
const POSTS_PER_PAGE = 10; 

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
  
  const postIdParam = searchParams?.get('postId'); 
  const boardFilter = searchParams?.get('f') || '전체'; 
  
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

  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('자유');
  const [newIsNotice, setNewIsNotice] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize(); 
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [boardFilter, searchQuery]);

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

  useEffect(() => { 
    fetchPosts(); 
  }, [page, boardFilter, searchQuery, displayName]);

  useEffect(() => {
    if (postIdParam) {
      fetchSinglePost(postIdParam); 
    } else {
      setSelectedPost(null); setComments([]); setReplyingTo(null);
    }
  }, [postIdParam]);

  const fetchSinglePost = async (id: string) => {
      const { data } = await supabase.from('posts').select('*').eq('id', id).single();
      if(data) { 
        setSelectedPost(data); 
        fetchComments(data.id);
        
        const viewedKey = `viewed_post_${data.id}`;
        if (!sessionStorage.getItem(viewedKey)) {
          incrementViews(data.id, data.views);
          sessionStorage.setItem(viewedKey, 'true');
        }
      }
  };

  const fetchComments = async (postId: number) => {
    const { data } = await supabase.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
    if (data) setComments(data);
  };

  const incrementViews = async (postId: number, currentViews: number) => {
    await supabase.from('posts').update({ views: currentViews + 1 }).eq('id', postId);
  };

  // 🚨 [방어막 적용 완료] 글 저장 로직에서 제목 길이를 철저하게 검사합니다.
  const handleSavePost = async () => {
    // 1. 앞뒤 빈칸(스페이스바 장난)을 없앤 진짜 제목 길이를 계산합니다.
    const trimmedTitle = newTitle.trim();
    const isContentEmpty = newContent.replace(/<[^>]*>?/gm, '').trim().length === 0 && !newContent.includes('<img');
    
    // 2. 제목이나 내용이 아예 없으면 튕겨냅니다.
    if (!trimmedTitle || isContentEmpty || !currentUser) {
      return alert('제목과 내용을 모두 입력해주세요.');
    }

    // 3. 누군가 해킹으로 50자를 넘기려고 해도 여기서 가차없이 튕겨냅니다.
    if (trimmedTitle.length > 50) {
      return alert('제목은 50자 이내로 입력해주세요.');
    }

    if (newContent.includes('src="data:image')) {
      return alert('이미지 붙여넣기 및 드래그 앤 드롭은 허용되지 않습니다.\n에디터 상단의 📷 이미지 버튼을 눌러 업로드해주세요.');
    }

    setIsLoading(true);
    let finalImageUrl = ''; 
    
    if (newContent.includes('<img')) {
      const imgMatch = newContent.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch && imgMatch[1]) {
        finalImageUrl = imgMatch[1];
      } else {
        finalImageUrl = 'has_image'; 
      }
    }

    // DB에 50자 이내로 안전하게 걸러진 제목(trimmedTitle)을 저장합니다.
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
    setIsLoading(false);
  };

  const handleSaveComment = async () => {
    if (!newComment.trim() || !currentUser || !selectedPost) return;
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
      setNewComment(''); setReplyingTo(null); fetchComments(selectedPost.id); fetchPosts();
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

  const handleSearch = () => { setPage(1); setSearchQuery(searchInput); };

  if (isWriting) {
    return <BoardWrite newTitle={newTitle} setNewTitle={setNewTitle} newContent={newContent} setNewContent={setNewContent} newCategory={newCategory} setNewCategory={setNewCategory} newIsNotice={newIsNotice} setNewIsNotice={setNewIsNotice} handleSavePost={handleSavePost} setIsWriting={setIsWriting} isAdmin={isAdmin} isLoading={isLoading} isMobile={isMobile} />;
  }

  if (selectedPost) {
    return <BoardDetail selectedPost={selectedPost} comments={comments} currentUser={currentUser} displayName={displayName} isAdmin={isAdmin} isMobile={isMobile} boardFilter={boardFilter} newComment={newComment} setNewComment={setNewComment} replyingTo={replyingTo} setReplyingTo={setReplyingTo} handleSaveComment={handleSaveComment} handleLikePost={handleLikePost} handleDeletePost={handleDeletePost} formatTimeAgo={formatTimeAgo} />;
  }

  return <BoardList posts={posts} boardFilter={boardFilter} totalPosts={totalPosts} page={page} setPage={setPage} searchInput={searchInput} setSearchInput={setSearchInput} searchOption={searchOption} setSearchOption={setSearchOption} handleSearch={handleSearch} setIsWriting={setIsWriting} isMobile={isMobile} formatTimeAgo={formatTimeAgo} />;
}