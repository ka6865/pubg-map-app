'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { MapContainer, ImageOverlay, Marker, Popup } from 'react-leaflet';
import L, { CRS } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

import Sidebar from './Sidebar';
import Board from './Board';
import MyPage from './MyPage';
import { La_Belle_Aurore } from 'next/font/google';

// 공용 아이콘 데이터 (SVG 경로: 알림 벨, 유저 아이콘)
const svgPaths = {
  bell: "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
  user: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
};

// 카테고리별 핀 색상 매핑
const CATEGORY_COLORS: { [key: string]: string } = {
  Garage: '#ef4444', Random: '#f59e0b', Esports: '#a855f7',
  Boat: '#3b82f6', EsportsBoat: '#8b5cf6', Glider: '#f97316', Key: '#10b981',
};

// 커스텀 마커 핀 생성 함수 (SVG를 포함한 DivIcon 반환)
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

// 핀 내부 아이콘 SVG 경로 데이터
const pinSvgPaths = {
  car: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
  boat: "M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.39-.6-.39H2.72c-.26 0-.5.15-.6.39s-.14.52-.06.78L3.95 19z",
  glider: "M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z",
  key: "M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"
};

// 카테고리별 아이콘 객체 생성
const icons = {
  Garage: createPinIcon(CATEGORY_COLORS.Garage, pinSvgPaths.car),
  Random: createPinIcon(CATEGORY_COLORS.Random, pinSvgPaths.car),
  Esports: createPinIcon(CATEGORY_COLORS.Esports, pinSvgPaths.car),
  Boat: createPinIcon(CATEGORY_COLORS.Boat, pinSvgPaths.boat),
  EsportsBoat: createPinIcon(CATEGORY_COLORS.EsportsBoat, pinSvgPaths.boat),
  Glider: createPinIcon(CATEGORY_COLORS.Glider, pinSvgPaths.glider),
  Key: createPinIcon(CATEGORY_COLORS.Key, pinSvgPaths.key),
};

// 맵 리스트 데이터 (ID, 라벨, 이미지 경로)
const MAP_LIST = [
  { id: 'Erangel', label: '에란겔', imageUrl: '/Erangel.jpg' },
  { id: 'Miramar', label: '미라마', imageUrl: '/Miramar.jpg' },
  { id: 'Taego', label: '태이고', imageUrl: '/Taego.jpg' },
  { id: 'Rondo', label: '론도', imageUrl: '/Rondo.jpg' },
  { id: 'Vikendi', label: '비켄디', imageUrl: '/Vikendi.jpg' },
  { id: 'Deston', label: '데스턴', imageUrl: '/Deston.jpg' },
];

export default function Map() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL 쿼리 파라미터에서 현재 탭(맵 ID 또는 Board) 가져오기
  const activeMapId = searchParams?.get('tab') || 'Erangel';

  // UI 상태 관리 (사이드바, 알림창, 마이페이지, 모바일 여부)
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [showNotiDropdown, setShowNotiDropdown] = useState(false);
  const [isMyPage, setIsMyPage] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // 사용자 및 데이터 상태 관리
  const [currentUser, setCurrentUser] = useState<any>(null); 
  const [userProfile, setUserProfile] = useState<any>(null); 
  const [optimisticNickname, setOptimisticNickname] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [filters, setFilters] = useState<{ [key: string]: boolean }>({
    Garage: false, Random: false, Esports: true, Boat: false, EsportsBoat: false, Glider: false, Key: false,
  });

  // DB에서 가져온 마커 데이터
  const [dbVehicles, setDbVehicles] = useState<any[]>([]);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
    };
    
    checkMobile();
    if (window.innerWidth < 768) setSidebarOpen(false);

    window.addEventListener('resize', checkMobile); 
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 표시할 닉네임 결정 (프로필 닉네임 > 이메일 앞부분 > 익명)
  const displayName = useMemo(() => {
    if (optimisticNickname) return optimisticNickname;
    if (userProfile?.nickname) return userProfile.nickname;
    return '익명';
  }, [optimisticNickname, userProfile]);

  // 관리자 여부 확인
  const isAdmin = userProfile?.role === 'admin';

  // 필터 토글 및 개수 계산 함수
  const toggleFilter = (id: string) => setFilters(prev => ({ ...prev, [id]: !prev[id] }));
  const getCount = (type: string) => dbVehicles.filter(v => v.mapId === activeMapId && v.type === type).length;

  // 초기 인증 상태 확인 및 데이터 로드
  useEffect(() => {
    const initAuthAndMap = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUser(session.user);
        await fetchUserProfile(session.user); 
        fetchNotifications(session.user.id);
      }
      setIsAuthLoading(false); 
      
      const { data: markers } = await supabase.from('map_markers').select('*');
      if (markers) {
        setDbVehicles(markers.map(m => ({ ...m, mapId: m.map_id })));
      }
      
      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          setCurrentUser(session.user);
          await fetchUserProfile(session.user);
        } else {
          setCurrentUser(null);
          setUserProfile(null);
          setOptimisticNickname(null);
        }
      });
    };
    initAuthAndMap();
  }, []);

  // 사용자 프로필 가져오기 (없으면 생성)
  const fetchUserProfile = async (user: any) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (data) {
      setUserProfile(data);
    } else {
      const emailPrefix = user.email?.split('@')[0] || '익명';
      await supabase.from('profiles').insert([{ id: user.id, nickname: emailPrefix }]);
      setUserProfile({ nickname: emailPrefix });
    }
  };

  // 알림 가져오기
  const fetchNotifications = async (userId: string) => {
    const { data } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (data) setNotifications(data);
  };

  // 탭 변경 핸들러
  const handleTabClick = (tabId: string) => {
    setIsMyPage(false); 
    router.push(`/?tab=${tabId}`);
  };

  // 알림 시간 포맷팅
  const formatNotiTime = (dateString: string) => {
    const diff = (new Date().getTime() - new Date(dateString).getTime()) / 1000;
    if (diff < 60) return '방금 전';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
    return new Date(dateString).toLocaleDateString();
  };

  // 알림 클릭 핸들러 (읽음 처리 및 해당 글로 이동)
  const handleNotiClick = async (noti: any) => {
    if (!noti.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', noti.id);
      setNotifications(prev => prev.map(n => n.id === noti.id ? { ...n, is_read: true } : n));
    }
    setShowNotiDropdown(false);
    setIsMyPage(false); 
    router.push(`/?tab=Board&postId=${noti.post_id}`);
  };

  // 모든 알림 읽음 처리
  const markAllAsRead = async () => {
    if (!currentUser) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const currentMap = MAP_LIST.find(m => m.id === activeMapId);
  const imageWidth = 8192; 
  const imageHeight = 8192;
  const bounds: [[number, number], [number, number]] = [[0, 0], [imageHeight, imageWidth]];

  return (
    // 전체 뼈대: 100dvh로 모바일 주소창 대응
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100dvh', fontFamily: "'Pretendard', sans-serif", overflow: 'hidden', backgroundColor: '#121212', color: 'white' }}>
      
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '50px', padding: '0 10px', backgroundColor: '#F2A900', borderBottom: '2px solid #cc8b00', zIndex: 6000, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
          {activeMapId !== 'Board' ? (
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '18px', flexShrink: 0 }}>☰</button>
          ) : null}
          <div onClick={() => handleTabClick('Erangel')} style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '900', fontStyle: 'italic', color: 'black', cursor: 'pointer', flexShrink: 0 }}>
            PUBG<span style={{ color: 'white' }}>MAP</span>
          </div>
          <nav style={{ display: 'flex', gap: '4px', overflowX: 'auto', scrollbarWidth: 'none', alignItems: 'center', msOverflowStyle: 'none' }}>
            {MAP_LIST.map(m => (
              <button key={m.id} onClick={() => handleTabClick(m.id)} style={{ height: '30px', padding: '0 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', backgroundColor: activeMapId === m.id ? '#1a1a1a' : 'transparent', color: activeMapId === m.id ? 'white' : 'black' }}>{m.label}</button>
            ))}
            
            <div style={{ width: '2px', height: '16px', backgroundColor: 'rgba(0,0,0,0.3)', margin: '0 4px', borderRadius: '2px' }} />
            
            <button onClick={() => handleTabClick('Board')} style={{ height: '30px', padding: '0 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', backgroundColor: activeMapId === 'Board' ? '#1a1a1a' : 'transparent', color: activeMapId === 'Board' ? '#F2A900' : 'black' }}>게시판</button>
          </nav>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {isAuthLoading ? (
            <span style={{ fontWeight: 'bold', color: 'rgba(0,0,0,0.5)', fontSize: '13px' }}>정보 확인 중...</span>
          ) : currentUser ? (
            <>
              {isAdmin && (
                <Link href="/map-editor" style={{ textDecoration: 'none' }}>
                  <button style={{ 
                    marginRight: '10px', padding: '6px 12px', backgroundColor: '#1a1a1a', color: '#F2A900', 
                    border: '1px solid #333', borderRadius: '4px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' 
                  }}>
                    관리자페이지
                  </button>
                </Link>
              )}
              
              <div style={{ position: 'relative' }}>
                <div onClick={() => setShowNotiDropdown(!showNotiDropdown)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="black"><path d={svgPaths.bell}/></svg>
                  {notifications.some(n => !n.is_read) ? <span style={{ position: 'absolute', top: '-2px', right: '-2px', width: '8px', height: '8px', backgroundColor: 'red', borderRadius: '50%' }}></span> : null}
                </div>

                {showNotiDropdown && (
                  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 6999 }} onClick={() => setShowNotiDropdown(false)} />
                )}

                {showNotiDropdown && (
                  <div style={{
                    position: 'absolute', top: '30px', right: '-10px', width: '280px', backgroundColor: '#1a1a1a',
                    border: '1px solid #333', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', 
                    zIndex: 7000, display: 'flex', flexDirection: 'column', maxHeight: '350px', overflow: 'hidden'
                  }}>
                    <div style={{ padding: '12px 15px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#252525' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#F2A900' }}>알림 내역</span>
                      {notifications.some(n => !n.is_read) && (
                        <button onClick={markAllAsRead} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>모두 읽음</button>
                      )}
                    </div>
                    
                    {/* 알림 목록 렌더링 */}
                    {/* 💡 [수정된 알림 목록 렌더링 부분] */}
                    <div style={{ overflowY: 'auto', flex: 1, backgroundColor: '#1a1a1a' }}>
                      {notifications.length === 0 ? (
                        <div style={{ padding: '30px 20px', textAlign: 'center', color: '#666', fontSize: '12px' }}>새로운 알림이 없습니다.</div>
                      ) : (
                        notifications.map(noti => (
                          <div 
                            key={noti.id} 
                            onClick={() => handleNotiClick(noti)} 
                            style={{ 
                              padding: '12px 15px', borderBottom: '1px solid #222', cursor: 'pointer', 
                              backgroundColor: noti.is_read ? 'transparent' : 'rgba(242, 169, 0, 0.08)', 
                              transition: 'background-color 0.2s',
                              display: 'flex', flexDirection: 'column', gap: '6px'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                              <div style={{ fontSize: '13px', color: noti.is_read ? '#777' : '#fff', lineHeight: '1.4', flex: 1, wordBreak: 'keep-all' }}>
                                <strong style={{ color: noti.is_read ? '#888' : '#F2A900' }}>{noti.sender_name}</strong>님이 
                                {noti.type === 'reply' ? ' 내 댓글에 답글을 남겼습니다.' : ' 내 글에 댓글을 남겼습니다.'}
                              </div>

                              {noti.preview_text && (
                                <div style={{
                                  maxWidth: '90px', 
                                  fontSize: '11px',
                                  color: noti.is_read ? '#555' : '#aaa',
                                  backgroundColor: noti.is_read ? 'transparent' : 'rgba(255,255,255,0.05)',
                                  padding: '4px 6px',
                                  borderRadius: '4px',
                                  border: '1px solid #333',
                                  flexShrink: 0,
                                  lineHeight: '1.4', /* 두 줄일 때 글씨가 겹치지 않게 줄간격 살짝 추가 */
                                  
                                  display: '-webkit-box',
                                  WebkitBoxOrient: 'vertical',
                                  WebkitLineClamp: 2, /* 이 프리뷰 두줄 */
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'normal', 
                                }}>
                                  {noti.preview_text}
                                </div>
                              )}
                            </div>
                            
                            <div style={{ fontSize: '11px', color: '#555' }}>
                              {formatNotiTime(noti.created_at)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div onClick={() => { setIsMyPage(true); router.push('/?tab=Board'); }} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="black"><path d={svgPaths.user}/></svg>
                </div>
                {!isMobile ? <span style={{ fontWeight: 'bold', color: 'black', fontSize: '13px' }}>{displayName}</span> : null}
              </div>
            </>
          ) : (
            <Link href="/login" style={{ textDecoration: 'none', fontWeight: 'bold', color: 'black', fontSize: '12px', backgroundColor: 'white', padding: '5px 10px', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.1)' }}>로그인</Link>
          )}
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {/* 탭에 따라 게시판/마이페이지 또는 지도 렌더링 */}
        {activeMapId === 'Board' ? (
          <div style={{ width: '100%', height: '100%', overflowY: 'auto', backgroundColor: '#0d0d0d' }}>
            <div style={{ maxWidth: '900px', margin: '0 auto', padding: isMobile ? '10px' : '20px' }}>
              {isMyPage ? (
                <MyPage 
                  currentUser={currentUser} 
                  userProfile={userProfile} 
                  setIsMyPage={setIsMyPage} 
                  fetchUserProfile={fetchUserProfile}
                  setOptimisticNickname={setOptimisticNickname}
                />
              ) : (
                <Board currentUser={currentUser} displayName={displayName} isAdmin={isAdmin} />
              )}
            </div>
          </div>
        ) : (
          <>
            <div style={{ 
                position: isMobile ? 'absolute' : 'relative',
                top: 0, left: 0, bottom: 0,
                zIndex: 5500,
                display: isSidebarOpen ? 'flex' : 'none',
                width: '260px',
                backgroundColor: '#1a1a1a'
            }}>
              <Sidebar isOpen={isSidebarOpen} setIsOpen={setSidebarOpen} mapLabel={currentMap?.label || ''} filters={filters} toggleFilter={toggleFilter} getCount={getCount} />
            </div>

            <div style={{ flex: 1, position: 'relative' }}>
                <MapContainer 
                  key={activeMapId} 
                  center={[imageHeight / 2, imageWidth / 2]} 
                  zoom={-3} 
                  minZoom={-4} 
                  maxZoom={2} 
                  crs={CRS.Simple} 
                  style={{ height: '100%', width: '100%', background: '#0b0f19' }} 
                  zoomControl={false}
                >
                    {currentMap ? <ImageOverlay url={currentMap.imageUrl} bounds={bounds} /> : null}
                    {dbVehicles.filter(v => v.mapId === activeMapId && filters[v.type]).map(v => (
                        <Marker key={v.id} position={[v.y, v.x]} icon={icons[v.type as keyof typeof icons]}>
                            <Popup>{v.name}</Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>
          </>
        )}
      </main>
    </div>
  );
}