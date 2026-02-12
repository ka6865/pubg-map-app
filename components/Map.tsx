'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, ImageOverlay, Marker, Popup } from 'react-leaflet';
import L, { CRS } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { STATIC_VEHICLES } from '../data/vehicles';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

// 관리자 이메일 설정
const ADMIN_EMAIL = "ka6865@gmail.com"; 

// --- [1. 아이콘 디자인 자산] ---
const svgPaths = {
  car: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
  boat: "M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.39-.6-.39H2.72c-.26 0-.5.15-.6.39s-.14.52-.06.78L3.95 19z",
  glider: "M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z",
  key: "M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z",
  bell: "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
  user: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
};

// 카테고리별 색상 정의
const CATEGORY_COLORS: { [key: string]: string } = {
  Garage: '#ef4444',     // 차고지 (빨강)
  Random: '#f59e0b',     // 일반 차량 (노랑)
  Esports: '#a855f7',    // 대회 고정 (보라)
  Boat: '#3b82f6',       // 보트 (파랑)
  EsportsBoat: '#8b5cf6',// 대회 보트 (연보라)
  Glider: '#f97316',     // 글라이더 (주황)
  Key: '#10b981',        // 열쇠 (초록)
};

const createPinIcon = (colorCode: string, pathData: string) => {
  return L.divIcon({
    className: 'custom-pin-icon',
    html: `
      <div style="position: relative; width: 28px; height: 38px;">
        <svg viewBox="0 0 30 42" style="width: 100%; height: 100%; filter: drop-shadow(0 3px 4px rgba(0,0,0,0.8));">
          <path d="M15 0C6.7 0 0 6.7 0 15c0 8.3 15 27 15 27s15-18.7 15-27C30 6.7 23.3 0 15 0z" fill="${colorCode}" stroke="#ffffff" stroke-width="2"/>
        </svg>
        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 26px; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: white;">
            <path d="${pathData}"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [28, 38],
    iconAnchor: [14, 38],
  });
};

const icons = {
  Garage: createPinIcon(CATEGORY_COLORS.Garage, svgPaths.car),
  Random: createPinIcon(CATEGORY_COLORS.Random, svgPaths.car),
  Esports: createPinIcon(CATEGORY_COLORS.Esports, svgPaths.car),
  Boat: createPinIcon(CATEGORY_COLORS.Boat, svgPaths.boat),
  EsportsBoat: createPinIcon(CATEGORY_COLORS.EsportsBoat, svgPaths.boat),
  Glider: createPinIcon(CATEGORY_COLORS.Glider, svgPaths.glider),
  Key: createPinIcon(CATEGORY_COLORS.Key, svgPaths.key),
};

const MAP_LIST = [
  { id: 'Erangel', label: '에란겔', imageUrl: '/Erangel.jpg' },
  { id: 'Miramar', label: '미라마', imageUrl: '/Miramar.jpg' },
  { id: 'Taego', label: '태이고', imageUrl: '/Taego.jpg' },
  { id: 'Rondo', label: '론도', imageUrl: '/Rondo.jpg' },
  { id: 'Vikendi', label: '비켄디', imageUrl: '/Vikendi.jpg' },
];

const BOARD_CATEGORIES = ['자유', '듀오/스쿼드 모집', '클럽홍보', '제보/문의'];

const Map = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const activeMapId = searchParams?.get('tab') || 'Erangel';
  const postIdParam = searchParams?.get('postId');
  const boardFilter = searchParams?.get('f') || '전체';

  const imageWidth = 8192;
  const imageHeight = 8192;
  const bounds: [[number, number], [number, number]] = [[0, 0], [imageHeight, imageWidth]];
  
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  
  // 상태 관리
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [isWriting, setIsWriting] = useState(false);
  const [isMyPage, setIsMyPage] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotiDropdown, setShowNotiDropdown] = useState(false);

  // 글쓰기 상태
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('자유');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newIsNotice, setNewIsNotice] = useState(false);
  const [newComment, setNewComment] = useState('');

  // 마이페이지 상태
  const [editNickname, setEditNickname] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const lastIncrementedId = useRef<string | null>(null);
  const isAdmin = currentUser?.email === ADMIN_EMAIL;

  // 🌟 [수정] 닉네임 표시 로직 강화 (이메일 우선 표시)
  const displayName = useMemo(() => {
    if (userProfile?.nickname) return userProfile.nickname;
    if (currentUser?.email) return currentUser.email.split('@')[0];
    return '익명';
  }, [userProfile, currentUser]);

  const [filters, setFilters] = useState<{ [key: string]: boolean }>({
    Garage: false, Random: false, Esports: true, Boat: false, EsportsBoat: false, Glider: false, Key: false,
  });

  const fetchUserProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      setUserProfile(data);
      setEditNickname(data.nickname || '');
      setEditAvatarUrl(data.avatar_url || '');
    } else {
      // 프로필이 없으면 생성
      const initialNickname = currentUser?.email?.split('@')[0] || '익명';
      await supabase.from('profiles').insert([{ id: userId, nickname: initialNickname }]);
      setUserProfile({ nickname: initialNickname });
      setEditNickname(initialNickname);
    }
  };

  const fetchNotifications = async (userId: string) => {
    const { data } = await supabase.from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (data) setNotifications(data);
  };

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUser(session.user);
        fetchUserProfile(session.user.id);
        fetchNotifications(session.user.id);
      }
      supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setCurrentUser(session.user);
          fetchUserProfile(session.user.id);
          fetchNotifications(session.user.id);
        } else {
          setCurrentUser(null);
          setUserProfile(null);
          setNotifications([]);
        }
      });
    };
    initAuth();
  }, []);

  const handleTabClick = (tabId: string) => {
    setIsMyPage(false);
    router.push(`/?tab=${tabId}`);
  };

  const fetchComments = async (postId: number) => {
    const { data } = await supabase.from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (data) setComments(data);
  };

  useEffect(() => {
    if (postIdParam && posts.length > 0) {
      const post = posts.find(p => p.id.toString() === postIdParam);
      if (post) {
        setSelectedPost(post);
        fetchComments(post.id);
        if (lastIncrementedId.current !== postIdParam) {
           incrementViews(post.id, post.views);
           lastIncrementedId.current = postIdParam;
        }
      }
    } else if (!postIdParam) {
      setSelectedPost(null);
      setComments([]);
      lastIncrementedId.current = null;
    }
  }, [postIdParam, posts]);

  const fetchPosts = async () => {
    setIsLoading(true);
    const { data } = await supabase.from('posts')
      .select('*')
      .order('is_notice', { ascending: false })
      .order('created_at', { ascending: false });
    if (data) setPosts(data);
    setIsLoading(false);
  };

  useEffect(() => {
    if (activeMapId === 'Board') {
      setIsWriting(false);
      fetchPosts();
    }
  }, [activeMapId]);

  const incrementViews = async (postId: number, currentViews: number) => {
    await supabase.from('posts').update({ views: currentViews + 1 }).eq('id', postId);
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, views: currentViews + 1 } : p));
  };

  const handleSaveComment = async () => {
    if (!newComment.trim() || !currentUser) return;
    const { error } = await supabase.from('comments').insert([{
      post_id: selectedPost.id,
      user_id: currentUser.id,
      author: displayName,
      content: newComment
    }]);

    if (!error) {
      if (selectedPost.user_id !== currentUser.id) {
        await supabase.from('notifications').insert([{
          user_id: selectedPost.user_id,
          sender_id: currentUser.id,
          sender_name: displayName,
          type: 'comment',
          post_id: selectedPost.id
        }]);
      }
      setNewComment('');
      fetchComments(selectedPost.id);
      fetchNotifications(selectedPost.user_id);
    }
  };

  const handleReadAllNoti = async () => {
    if (!currentUser) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id);
    fetchNotifications(currentUser.id);
  };

  const handleUpdateProfile = async () => {
    if (!currentUser) return;
    const { error } = await supabase.from('profiles').upsert({
      id: currentUser.id,
      nickname: editNickname,
      avatar_url: editAvatarUrl,
      updated_at: new Date()
    });
    if (!error) {
      alert('프로필이 업데이트되었습니다.');
      fetchUserProfile(currentUser.id);
    }
  };

  const handleSavePost = async () => {
    if (!newTitle.trim() || !newContent.trim() || !currentUser) return;
    setIsLoading(true);
    const { error } = await supabase.from('posts').insert([{ 
      title: newTitle, content: newContent, 
      author: displayName,
      user_id: currentUser.id, category: newCategory,
      image_url: newImageUrl, is_notice: isAdmin ? newIsNotice : false
    }]);
    if (!error) {
      setIsWriting(false); fetchPosts();
    }
    setIsLoading(false);
  };

  // 🌟 [수정] 추천 기능 안전장치 추가 (prev가 존재할 때만 업데이트)
  const handleLikePost = async (postId: number, currentLikes: number) => {
    if (!currentUser) return alert('로그인 후 추천할 수 있습니다!');
    
    // 1. 이미 추천했는지 확인
    const { data: existingLike } = await supabase.from('post_likes').select('*').eq('post_id', postId).eq('user_id', currentUser.id).single();
    if (existingLike) return alert('이미 추천하신 게시글입니다!');

    // 2. 추천 기록 및 카운트 증가
    await supabase.from('post_likes').insert([{ post_id: postId, user_id: currentUser.id }]);
    const { error } = await supabase.from('posts').update({ likes: currentLikes + 1 }).eq('id', postId);

    if (!error) {
      alert('추천했습니다!');
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: currentLikes + 1 } : p));
      if (selectedPost && selectedPost.id === postId) {
          setSelectedPost((prev: any) => prev ? { ...prev, likes: currentLikes + 1 } : null);
      }
    }
  };
  
  // 삭제 기능
  const handleDeletePost = async (postId: number) => {
    if (!window.confirm('정말 삭제하시겠습니까? 복구할 수 없습니다.')) return;
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (!error) {
      alert('삭제되었습니다.');
      router.push('/?tab=Board');
      fetchPosts();
    }
  };

  const filteredPosts = posts.filter(post => {
    if (post.is_notice) return true;
    if (boardFilter === '전체') return true;
    if (boardFilter === '추천') return post.likes >= 5;
    return post.category === boardFilter;
  });

  const toggleFilter = (id: string) => setFilters(prev => ({ ...prev, [id]: !prev[id] }));
  const getCount = (type: string) => STATIC_VEHICLES.filter(v => v.mapId === activeMapId && v.type === type).length;
  const currentMap = MAP_LIST.find(m => m.id === activeMapId);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) { setIsMobile(true); }
      else { setIsMobile(false); }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', fontFamily: "'Pretendard', sans-serif", overflow: 'hidden', backgroundColor: '#121212', color: 'white' }}>
      
      {/* 🟢 상단 헤더 (노란색 배경 고정) */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '50px', zIndex: 6000, padding: '0 15px', backgroundColor: '#F2A900', borderBottom: '2px solid #cc8b00', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', height: '100%' }}>
          {activeMapId !== 'Board' && (
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
               <svg viewBox="0 0 24 24" width="24" height="24" fill="black"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
            </button>
          )}
          <div onClick={() => handleTabClick('Erangel')} style={{ fontSize: '20px', fontWeight: '900', fontStyle: 'italic', color: 'black', cursor: 'pointer', letterSpacing: '-1px' }}>
            PUBG<span style={{ color: 'white' }}>MAP</span>
          </div>
          <nav style={{ display: 'flex', gap: '5px', overflowX: 'auto', scrollbarWidth: 'none', height: '100%', alignItems: 'center' }}>
            {MAP_LIST.map(m => (
              <button key={m.id} onClick={() => handleTabClick(m.id)} style={{ height: '34px', padding: '0 12px', borderRadius: '4px', fontWeight: 'bold', fontSize: '13px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', backgroundColor: activeMapId === m.id ? '#1a1a1a' : 'transparent', color: activeMapId === m.id ? 'white' : 'black' }}>{m.label}</button>
            ))}
            <button onClick={() => handleTabClick('Board')} style={{ height: '34px', padding: '0 12px', borderRadius: '4px', fontWeight: 'bold', fontSize: '13px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', backgroundColor: activeMapId === 'Board' ? '#1a1a1a' : 'transparent', color: activeMapId === 'Board' ? '#F2A900' : 'black' }}>게시판</button>
          </nav>
        </div>

        {/* 🌟 헤더 아이콘 및 프로필 영역 (수직 정렬 완벽 수정) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', height: '100%' }}>
          {currentUser ? (
            <>
              {/* 알림 아이콘 */}
              <div style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'center' }} onClick={() => setShowNotiDropdown(!showNotiDropdown)}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill={notifications.some(n => !n.is_read) ? "#34A853" : "black"}><path d={svgPaths.bell}/></svg>
                {notifications.filter(n => !n.is_read).length > 0 && (
                  <span style={{ position: 'absolute', top: '10px', right: '-6px', backgroundColor: '#FF4D4D', color: 'white', fontSize: '10px', padding: '1px 4px', borderRadius: '10px', fontWeight: 'bold', border: '1.5px solid #F2A900' }}>
                    {notifications.filter(n => !n.is_read).length}
                  </span>
                )}
                {/* 알림 드롭다운 */}
                {showNotiDropdown && (
                  <div style={{ position: 'absolute', top: '45px', right: 0, width: '300px', backgroundColor: '#1A1A1A', border: '1px solid #333', borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,0.8)', zIndex: 7000 }}>
                    <div style={{ padding: '12px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'white' }}>최근 알림</span>
                      <button onClick={(e) => { e.stopPropagation(); handleReadAllNoti(); }} style={{ background: 'none', border: 'none', color: '#888', fontSize: '12px', cursor: 'pointer' }}>모두 읽음</button>
                    </div>
                    <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                      {notifications.length === 0 ? <div style={{ padding: '30px', textAlign: 'center', color: '#555', fontSize: '13px' }}>알림이 없습니다.</div> : 
                        notifications.map(n => (
                          <div key={n.id} onClick={() => { setShowNotiDropdown(false); router.push(`/?tab=Board&postId=${n.post_id}`); }} style={{ padding: '15px', borderBottom: '1px solid #222', backgroundColor: n.is_read ? 'transparent' : 'rgba(242, 169, 0, 0.05)', cursor: 'pointer', transition: 'background 0.2s' }}>
                            <div style={{ fontSize: '13px', color: '#ddd', lineHeight: '1.4' }}><strong>{n.sender_name}</strong>님이 게시글에 댓글을 남겼습니다.</div>
                            <div style={{ fontSize: '11px', color: '#555', marginTop: '6px' }}>{new Date(n.created_at).toLocaleString()}</div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>

              {/* 프로필 영역 */}
              <div onClick={() => { setIsMyPage(true); router.push('/?tab=Board'); }} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', height: '100%', paddingLeft: '8px', borderLeft: '1px solid rgba(0,0,0,0.1)' }}>
                {userProfile?.avatar_url ? (
                  <img src={userProfile.avatar_url} style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #333' }} />
                ) : (
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="black"><path d={svgPaths.user}/></svg>
                  </div>
                )}
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'black' }}>{displayName}</span>
              </div>
            </>
          ) : (
            <Link href="/login" style={{ textDecoration: 'none', color: 'black', fontWeight: 'bold', fontSize: '12px', padding: '6px 15px', borderRadius: '4px', backgroundColor: 'white', border: '1px solid rgba(0,0,0,0.1)' }}>로그인</Link>
          )}
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {activeMapId === 'Board' ? (
          <div style={{ width: '100%', height: '100%', overflowY: 'auto', backgroundColor: '#0d0d0d' }}>
            <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
              
              {isMyPage ? (
                /* 🏠 마이페이지 화면 */
                <div style={{ backgroundColor: '#1a1a1a', padding: '40px', borderRadius: '12px', border: '1px solid #333' }}>
                  <h2 style={{ marginBottom: '30px', color: '#F2A900', fontSize: '24px', fontWeight: 'bold' }}>👤 마이페이지</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '500px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#888', fontWeight: 'bold' }}>프로필 사진 (이미지 직접 링크)</label>
                      <input type="text" value={editAvatarUrl} onChange={(e) => setEditAvatarUrl(e.target.value)} placeholder="https://... (JPG, PNG 등)" style={{ width: '100%', padding: '12px', backgroundColor: '#252525', border: '1px solid #444', color: 'white', borderRadius: '6px', fontSize: '14px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#888', fontWeight: 'bold' }}>닉네임 변경</label>
                      <input type="text" value={editNickname} onChange={(e) => setEditNickname(e.target.value)} style={{ width: '100%', padding: '12px', backgroundColor: '#252525', border: '1px solid #444', color: 'white', borderRadius: '6px', fontSize: '14px' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                      <button onClick={handleUpdateProfile} style={{ flex: 1, padding: '12px', backgroundColor: '#F2A900', border: 'none', borderRadius: '6px', fontWeight: 'bold', color: 'black', cursor: 'pointer' }}>저장하기</button>
                      <button onClick={() => setIsMyPage(false)} style={{ flex: 1, padding: '12px', backgroundColor: '#333', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer' }}>돌아가기</button>
                    </div>
                    <button onClick={() => { supabase.auth.signOut(); setIsMyPage(false); }} style={{ marginTop: '20px', padding: '12px', border: '1px solid #444', background: 'none', color: '#ff4d4d', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>로그아웃</button>
                  </div>
                </div>
              ) : isWriting ? (
                /* 📝 글쓰기 화면 */
                <div style={{ backgroundColor: '#1a1a1a', padding: '30px', borderRadius: '8px', border: '1px solid #333' }}>
                  <h2 style={{ marginBottom: '20px', color: '#F2A900', fontSize: '20px', fontWeight: 'bold' }}>새 게시글 작성</h2>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                    <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={{ padding: '10px', backgroundColor: '#252525', color: 'white', border: '1px solid #333', borderRadius: '4px' }}>
                      {BOARD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="text" placeholder="제목을 입력하세요" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ flex: 1, padding: '10px', backgroundColor: '#252525', color: 'white', border: '1px solid #333', borderRadius: '4px', fontSize: '16px' }} />
                  </div>
                  <input type="text" placeholder="이미지 URL (ImgBB 등 직접 링크 사용)" value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} style={{ width: '100%', padding: '10px', backgroundColor: '#252525', color: 'white', border: '1px solid #333', borderRadius: '4px', marginBottom: '15px', boxSizing: 'border-box' }} />
                  <textarea placeholder="내용을 작성하세요..." value={newContent} onChange={(e) => setNewContent(e.target.value)} style={{ width: '100%', height: '350px', padding: '15px', backgroundColor: '#252525', color: 'white', border: '1px solid #333', borderRadius: '4px', resize: 'none', marginBottom: '15px', boxSizing: 'border-box', lineHeight: '1.6', fontSize: '15px' }} />
                  {isAdmin && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', color: '#F2A900', cursor: 'pointer', fontSize: '14px' }}>
                      <input type="checkbox" checked={newIsNotice} onChange={(e) => setNewIsNotice(e.target.checked)} /> 공지사항으로 등록
                    </label>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button onClick={() => setIsWriting(false)} style={{ padding: '10px 20px', backgroundColor: '#333', color: '#ccc', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>취소</button>
                    <button onClick={handleSavePost} disabled={isLoading} style={{ padding: '10px 30px', backgroundColor: '#F2A900', color: 'black', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>등록하기</button>
                  </div>
                </div>
              ) : selectedPost ? (
                /* 📖 상세 보기 화면 (이미지 짤림 방지 수정) */
                <div style={{ backgroundColor: '#1a1a1a', padding: '30px', borderRadius: '8px', border: '1px solid #333', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
                  <div style={{ marginBottom: '20px' }}>
                    <span style={{ color: '#F2A900', fontSize: '13px', fontWeight: 'bold' }}>[{selectedPost.category}]</span>
                    <h2 style={{ fontSize: '32px', marginTop: '10px', color: 'white', fontWeight: '800' }}>{selectedPost.title}</h2>
                    <div style={{ fontSize: '13px', color: '#888', marginTop: '12px', display: 'flex', gap: '15px', alignItems: 'center' }}>
                      <span>글쓴이: <strong style={{ color: '#F2A900' }}>{selectedPost.author}</strong></span>
                      <span style={{ width: '1px', height: '10px', backgroundColor: '#444' }}></span>
                      <span>날짜: {new Date(selectedPost.created_at).toLocaleString()}</span>
                      <span style={{ width: '1px', height: '10px', backgroundColor: '#444' }}></span>
                      <span>조회: {selectedPost.views}</span>
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid #333', borderBottom: '1px solid #333', padding: '30px 0', lineHeight: '1.8', color: '#e5e5e5', minHeight: '200px' }}>
                    {/* 🌟 이미지 출력 (비율 유지, 잘림 방지) */}
                    {selectedPost.image_url && (
                      <div style={{ width: '100%', textAlign: 'center', marginBottom: '25px', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <img src={selectedPost.image_url} style={{ maxWidth: '100%', maxHeight: '600px', objectFit: 'contain' }} alt="첨부 이미지" />
                      </div>
                    )}
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '16px' }}>{selectedPost.content}</div>
                  </div>
                  
                  {/* 댓글 섹션 */}
                  <div style={{ marginTop: '40px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                       <h3 style={{ fontSize: '18px', color: '#F2A900', fontWeight: 'bold' }}>댓글 ({comments.length})</h3>
                       {/* 추천 버튼 */}
                       <button onClick={() => handleLikePost(selectedPost.id, selectedPost.likes || 0)} style={{ padding: '8px 16px', backgroundColor: '#252525', border: '1px solid #F2A900', color: '#F2A900', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                         👍 추천 <span style={{ color: 'white' }}>{selectedPost.likes || 0}</span>
                       </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {comments.map(c => (
                        <div key={c.id} style={{ padding: '15px', backgroundColor: '#222', borderRadius: '8px', borderLeft: '3px solid #34A853' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#34A853' }}>{c.author}</span>
                            <span style={{ fontSize: '11px', color: '#666' }}>{new Date(c.created_at).toLocaleString()}</span>
                          </div>
                          <div style={{ fontSize: '14px', lineHeight: '1.5', color: '#ddd' }}>{c.content}</div>
                        </div>
                      ))}
                    </div>
                    {currentUser && (
                      <div style={{ marginTop: '25px', display: 'flex', gap: '10px' }}>
                        <textarea placeholder="댓글을 남겨주세요..." value={newComment} onChange={(e) => setNewComment(e.target.value)} style={{ flex: 1, height: '80px', padding: '15px', backgroundColor: '#111', border: '1px solid #333', color: 'white', borderRadius: '4px', resize: 'none', fontSize: '14px' }} />
                        <button onClick={handleSaveComment} style={{ width: '80px', backgroundColor: '#34A853', border: 'none', color: 'white', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer' }}>등록</button>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '40px' }}>
                    <button onClick={() => router.push(`/?tab=Board&f=${boardFilter}`)} style={{ flex: 1, padding: '15px', backgroundColor: '#333', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>목록으로 돌아가기</button>
                    {(currentUser?.id === selectedPost.user_id || isAdmin) && (
                      <button onClick={() => handleDeletePost(selectedPost.id)} style={{ padding: '15px 30px', backgroundColor: '#dc3545', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>삭제</button>
                    )}
                  </div>
                </div>
              ) : (
                /* 📋 목록 화면 */
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '5px', scrollbarWidth: 'none' }}>
                      {['전체', '추천', ...BOARD_CATEGORIES].map(f => (
                        <button key={f} onClick={() => router.push(`/?tab=Board&f=${f}`)} style={{ padding: '8px 20px', borderRadius: '20px', border: '1px solid #333', backgroundColor: boardFilter === f ? '#F2A900' : '#1a1a1a', color: boardFilter === f ? 'black' : '#aaa', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '13px' }}>{f}</button>
                      ))}
                    </div>
                    <button onClick={() => setIsWriting(true)} style={{ padding: '10px 30px', backgroundColor: '#34A853', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', flexShrink: 0, fontSize: '14px' }}>글쓰기</button>
                  </div>
                  <div style={{ backgroundColor: '#1a1a1a', borderRadius: '8px', border: '1px solid #333', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#252525', color: '#888', borderBottom: '1px solid #333' }}>
                          <th style={{ padding: '15px', width: '12%' }}>분류</th>
                          <th style={{ padding: '15px' }}>제목</th>
                          <th style={{ padding: '15px', width: '15%' }}>글쓴이</th>
                          <th style={{ padding: '15px', width: '10%' }}>조회</th>
                          <th style={{ padding: '15px', width: '8%' }}>추천</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPosts.map(post => (
                          <tr key={post.id} onClick={() => router.push(`/?tab=Board&f=${boardFilter}&postId=${post.id}`)} style={{ borderBottom: '1px solid #222', cursor: 'pointer', transition: 'background 0.1s', backgroundColor: post.is_notice ? 'rgba(242, 169, 0, 0.05)' : 'transparent' }}>
                            <td style={{ padding: '15px' }}>
                              <span style={{ color: post.is_notice ? '#F2A900' : '#777', fontWeight: 'bold', fontSize: '13px' }}>{post.is_notice ? '공지' : post.category}</span>
                            </td>
                            <td style={{ padding: '15px', color: post.is_notice ? '#F2A900' : 'white', fontWeight: post.is_notice ? 'bold' : 'normal' }}>{post.title}</td>
                            <td style={{ padding: '15px', color: '#aaa', fontSize: '13px' }}>{post.author}</td>
                            <td style={{ padding: '15px', color: '#666', fontSize: '13px' }}>{post.views}</td>
                            <td style={{ padding: '15px', color: (post.likes || 0) >= 5 ? '#F2A900' : '#666', fontWeight: (post.likes || 0) >= 5 ? 'bold' : 'normal', fontSize: '13px' }}>{post.likes || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredPosts.length === 0 && <div style={{ padding: '50px', textAlign: 'center', color: '#666' }}>등록된 게시글이 없습니다.</div>}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          /* 🗺️ 지도 화면 (사이드바 스타일 복구) */
          <>
            <aside style={{ 
                width: '260px', backgroundColor: '#1a1a1a', borderRight: '1px solid #333', 
                display: isSidebarOpen ? 'flex' : 'none', flexDirection: 'column', flexShrink: 0, zIndex: 5000 
              }}>
              <div style={{ padding: '20px 15px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '20px', color: '#F2A900', fontWeight: '900', letterSpacing: '-0.5px' }}>{currentMap?.label}</h2>
                <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '20px' }}>✕</button>
              </div>
              <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  { id: 'Garage', label: '차고지', path: svgPaths.car, color: CATEGORY_COLORS.Garage },
                  { id: 'Random', label: '일반 차량', path: svgPaths.car, color: CATEGORY_COLORS.Random },
                  { id: 'Esports', label: '대회 고정', path: svgPaths.car, color: CATEGORY_COLORS.Esports },
                  { id: 'Boat', label: '보트', path: svgPaths.boat, color: CATEGORY_COLORS.Boat },
                  { id: 'EsportsBoat', label: '대회 보트', path: svgPaths.boat, color: CATEGORY_COLORS.EsportsBoat },
                  { id: 'Glider', label: '글라이더', path: svgPaths.glider, color: CATEGORY_COLORS.Glider },
                  { id: 'Key', label: '비밀 열쇠', path: svgPaths.key, color: CATEGORY_COLORS.Key },
                ].map(item => (
                  <div key={item.id} onClick={() => toggleFilter(item.id)} style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', borderRadius: '8px', cursor: 'pointer', 
                    backgroundColor: filters[item.id] ? '#252525' : 'transparent', 
                    borderLeft: filters[item.id] ? `4px solid ${item.color}` : '4px solid transparent', 
                    transition: 'all 0.15s ease' 
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill={filters[item.id] ? item.color : "#555"}><path d={item.path}/></svg>
                      <span style={{ fontSize: '14px', color: filters[item.id] ? 'white' : '#777', fontWeight: filters[item.id] ? 'bold' : 'normal' }}>{item.label}</span>
                    </div>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: filters[item.id] ? item.color : '#2a2a2a', color: filters[item.id] ? (item.id === 'Esports' ? 'white' : 'black') : '#666', fontWeight: 'bold' }}>{getCount(item.id)}</span>
                  </div>
                ))}
              </div>
            </aside>
            
            <div style={{ flex: 1, position: 'relative' }}>
              {!isSidebarOpen && (
                <button onClick={() => setSidebarOpen(true)} style={{ position: 'absolute', top: '15px', left: '15px', zIndex: 4000, backgroundColor: '#F2A900', border: 'none', borderRadius: '4px', width: '40px', height: '40px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.6)' }}>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="black"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
                </button>
              )}
              <MapContainer key={activeMapId} center={[imageHeight / 2, imageWidth / 2]} zoom={-3} minZoom={-4} maxZoom={2} crs={CRS.Simple} style={{ height: '100%', width: '100%', background: '#0b0f19' }} zoomControl={false}>
                {currentMap && <ImageOverlay url={currentMap.imageUrl} bounds={bounds} />}
                {STATIC_VEHICLES.filter(v => v.mapId === activeMapId && filters[v.type]).map(v => (
                  <Marker key={v.id} position={[v.y, v.x]} icon={icons[v.type as keyof typeof icons]}>
                    <Popup className="custom-popup"><div style={{ textAlign: 'center', fontWeight: 'bold', color: 'black' }}>{v.name}</div></Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Map;