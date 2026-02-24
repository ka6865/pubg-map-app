'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { Post, Comment } from '../types/board';

import BoardList from './BoardList';
import BoardDetail from './BoardDetail';
import BoardWrite from './BoardWrite';

const ADMIN_EMAIL = "ka6865@gmail.com";
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
  
  // --- 데이터 상태 ---
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [isWriting, setIsWriting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // --- UI 상태 ---
  const [page, setPage] = useState(1);
  const [totalPosts, setTotalPosts] = useState(0);
  const [searchInput, setSearchInput] = useState(''); 
  const [searchQuery, setSearchQuery] = useState(''); 
  const [searchOption, setSearchOption] = useState('all');
  const [isMobile, setIsMobile] = useState(false);

  // --- 입력 폼 상태 ---
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('자유');
  const [newIsNotice, setNewIsNotice] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);

  const quillRef = useRef<any>(null);
  const isAdmin = currentUser?.email === ADMIN_EMAIL;

  // 모바일 환경 감지
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize(); 
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 🔄 [로직] 필터나 검색어 변경 시 페이지 초기화
  useEffect(() => {
    setPage(1);
  }, [boardFilter, searchQuery]);

  // 날짜 포맷팅
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

  // 이미지 업로드
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

  // 에디터 이미지 핸들러
  const imageHandler = () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = async () => {
      if (!input.files) return;
      const file = input.files[0];
      const maxSize = 3 * 1024 * 1024; // 3MB

      if (file.size > maxSize) {
        alert('이미지 파일 크기는 3MB를 초과할 수 없습니다.');
        return;
      }

      const editor = quillRef.current.getEditor();
      const range = editor.getSelection(true);
      
      try {
        editor.enable(false);
        const url = await uploadImage(file);
        
        if (url) {
          editor.insertEmbed(range.index, 'image', url);
          editor.setSelection(range.index + 1); 
        }
      } catch (e) {
        console.error(e);
      } finally {
        editor.enable(true);
      }
    };
  };

  // 🌟 게시글 목록 불러오기 (여기에 content가 추가되었습니다!)
  const fetchPosts = async () => {
    setIsLoading(true);
    const from = (page - 1) * POSTS_PER_PAGE;
    const to = from + POSTS_PER_PAGE - 1;

    let query = supabase.from('posts')
      // 👇 아래 줄의 'title, content, author' 부분에 content를 추가했습니다!
      .select('id, title, content, author, user_id, category, image_url, is_notice, created_at, views, likes, comments(count)', { count: 'exact' });

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
    if (postIdParam && posts.length > 0) {
      const post = posts.find(p => p.id.toString() === postIdParam);
      if (post) {
        setSelectedPost(post);
        fetchComments(post.id);
        
        const viewedKey = `viewed_post_${post.id}`;
        if (!sessionStorage.getItem(viewedKey)) {
          incrementViews(post.id, post.views);
          sessionStorage.setItem(viewedKey, 'true');
        }
      } else {
        fetchSinglePost(postIdParam);
      }
    } else if (!postIdParam) {
      setSelectedPost(null); setComments([]); setReplyingTo(null);
    }
  }, [postIdParam, posts.length]);

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

  const handleSavePost = async () => {
    const isContentEmpty = newContent.replace(/<[^>]*>?/gm, '').trim().length === 0 && !newContent.includes('<img');
    
    if (!newTitle.trim() || isContentEmpty || !currentUser) {
      return alert('제목과 내용을 모두 입력해주세요.');
    }

    if (newContent.includes('src="data:image')) {
      return alert('이미지 붙여넣기 및 드래그 앤 드롭은 허용되지 않습니다.\n에디터 상단의 📷 이미지 버튼을 눌러 업로드해주세요.');
    }

    setIsLoading(true);
    let finalImageUrl = '';
    const imgTagRegex = /<img[^>]+src\s*=\s*["']?([^"'\s>]+)["']?/;
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
      setNewComment(''); setReplyingTo(null); fetchComments(selectedPost.id);
      fetchPosts();
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

  const handleSearch = () => { 
    setPage(1); 
    setSearchQuery(searchInput); 
  };

  if (isWriting) {
    return <BoardWrite 
      newTitle={newTitle} setNewTitle={setNewTitle}
      newContent={newContent} setNewContent={setNewContent}
      newCategory={newCategory} setNewCategory={setNewCategory}
      newIsNotice={newIsNotice} setNewIsNotice={setNewIsNotice}
      handleSavePost={handleSavePost}
      setIsWriting={setIsWriting}
      isAdmin={isAdmin}
      isLoading={isLoading}
      isMobile={isMobile}
      quillRef={quillRef}
      imageHandler={imageHandler}
    />;
  }

  if (selectedPost) {
    return <BoardDetail 
      selectedPost={selectedPost}
      comments={comments}
      currentUser={currentUser}
      displayName={displayName}
      isAdmin={isAdmin}
      isMobile={isMobile}
      boardFilter={boardFilter}
      newComment={newComment} setNewComment={setNewComment}
      replyingTo={replyingTo} setReplyingTo={setReplyingTo}
      handleSaveComment={handleSaveComment}
      handleLikePost={handleLikePost}
      handleDeletePost={handleDeletePost}
      formatTimeAgo={formatTimeAgo}
    />;
  }

  return <BoardList 
    posts={posts}
    boardFilter={boardFilter}
    totalPosts={totalPosts}
    page={page} setPage={setPage}
    searchInput={searchInput} setSearchInput={setSearchInput}
    searchOption={searchOption} setSearchOption={setSearchOption}
    handleSearch={handleSearch}
    setIsWriting={setIsWriting}
    isMobile={isMobile}
    formatTimeAgo={formatTimeAgo}
  />;
}