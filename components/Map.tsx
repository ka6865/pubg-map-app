'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { MapContainer, ImageOverlay, Marker, Popup } from 'react-leaflet';
import L, { CRS } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { STATIC_VEHICLES } from '../data/vehicles';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

import Sidebar from './Sidebar';
import Board from './Board';
import MyPage from './MyPage';

// 공용 아이콘 데이터 (SVG 경로)
const svgPaths = {
  bell: "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
  user: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
};

const CATEGORY_COLORS: { [key: string]: string } = {
  Garage: '#ef4444', Random: '#f59e0b', Esports: '#a855f7',
  Boat: '#3b82f6', EsportsBoat: '#8b5cf6', Glider: '#f97316', Key: '#10b981',
};

// 커스텀 마커 핀 생성 함수
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

const pinSvgPaths = {
  car: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
  boat: "M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.39-.6-.39H2.72c-.26 0-.5.15-.6.39s-.14.52-.06.78L3.95 19z",
  glider: "M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z",
  key: "M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"
};

const icons = {
  Garage: createPinIcon(CATEGORY_COLORS.Garage, pinSvgPaths.car),
  Random: createPinIcon(CATEGORY_COLORS.Random, pinSvgPaths.car),
  Esports: createPinIcon(CATEGORY_COLORS.Esports, pinSvgPaths.car),
  Boat: createPinIcon(CATEGORY_COLORS.Boat, pinSvgPaths.boat),
  EsportsBoat: createPinIcon(CATEGORY_COLORS.EsportsBoat, pinSvgPaths.boat),
  Glider: createPinIcon(CATEGORY_COLORS.Glider, pinSvgPaths.glider),
  Key: createPinIcon(CATEGORY_COLORS.Key, pinSvgPaths.key),
};

const MAP_LIST = [
  { id: 'Erangel', label: '에란겔', imageUrl: '/Erangel.jpg' },
  { id: 'Miramar', label: '미라마', imageUrl: '/Miramar.jpg' },
  { id: 'Taego', label: '태이고', imageUrl: '/Taego.jpg' },
  { id: 'Rondo', label: '론도', imageUrl: '/Rondo.jpg' },
  { id: 'Vikendi', label: '비켄디', imageUrl: '/Vikendi.jpg' },
];

export default function Map() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // URL에서 '?tab=어쩌고'를 읽어와서 어떤 맵/게시판을 띄울지 결정함
  const activeMapId = searchParams?.get('tab') || 'Erangel';

  // --- UI 상태 ---
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [showNotiDropdown, setShowNotiDropdown] = useState(false);
  const [isMyPage, setIsMyPage] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // --- 유저 및 데이터 상태 ---
  const [currentUser, setCurrentUser] = useState<any>(null); // auth.users 원본
  const [userProfile, setUserProfile] = useState<any>(null); // profiles 테이블 데이터
  const [notifications, setNotifications] = useState<any[]>([]);
  const [filters, setFilters] = useState<{ [key: string]: boolean }>({
    Garage: false, Random: false, Esports: true, Boat: false, EsportsBoat: false, Glider: false, Key: false,
  });

  // 1. 모바일 환경 감지 (반응형 셋업)
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // 폰으로 보면 기본적으로 사이드바 닫아놔서 지도 넓게 보이게 설정
      if (mobile) setSidebarOpen(false);
    };
    checkMobile(); // 첫 렌더링 시 실행
    window.addEventListener('resize', checkMobile); // 창 크기 바뀔때마다 실행
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 상단 헤더에 보여줄 닉네임 계산 (프로필 닉네임 -> 구글 이메일 앞부분 -> 익명)
  const displayName = useMemo(() => {
    if (userProfile?.nickname) return userProfile.nickname;
    if (currentUser?.email) return currentUser.email.split('@')[0];
    return '익명';
  }, [userProfile, currentUser]);

  const toggleFilter = (id: string) => setFilters(prev => ({ ...prev, [id]: !prev[id] }));
  const getCount = (type: string) => STATIC_VEHICLES.filter(v => v.mapId === activeMapId && v.type === type).length;

  // 2. 인증 상태 셋업 및 리스너 등록
  useEffect(() => {
    const initAuth = async () => {
      // 새로고침 시 로컬스토리지 토큰 읽어서 로그인 복구
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUser(session.user);
        fetchUserProfile(session.user);
        fetchNotifications(session.user.id);
      }
      
      // 앱 켜져있는 동안 로그인/로그아웃 이벤트 감지해서 실시간 반영
      supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setCurrentUser(session.user);
          fetchUserProfile(session.user);
        } else {
          setCurrentUser(null);
          setUserProfile(null);
        }
      });
    };
    initAuth();
  }, []);

  // 3. 닉네임 정보 가져오기 & 없으면 이메일 앞부분 잘라서 자동 생성 (가입 시 최초 1회 작동)
  const fetchUserProfile = async (user: any) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (data) {
      setUserProfile(data);
    } else {
      // 프로필이 없다? -> 첫 로그인이다 -> 이메일 앞부분 잘라서 닉네임으로 강제 저장
      const emailPrefix = user.email?.split('@')[0] || '익명';
      await supabase.from('profiles').insert([{ id: user.id, nickname: emailPrefix }]);
      setUserProfile({ nickname: emailPrefix });
    }
  };

  const fetchNotifications = async (userId: string) => {
    const { data } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (data) setNotifications(data);
  };

  // 탭 클릭하면 URL 변경 (상태가 바뀌면서 컴포넌트 알아서 리렌더링됨)
  const handleTabClick = (tabId: string) => {
    setIsMyPage(false); // 맵이나 게시판 누르면 마이페이지 닫기
    router.push(`/?tab=${tabId}`);
  };

  const currentMap = MAP_LIST.find(m => m.id === activeMapId);
  const imageWidth = 8192; 
  const imageHeight = 8192;
  const bounds: [[number, number], [number, number]] = [[0, 0], [imageHeight, imageWidth]];

  return (
    // 전체 뼈대: 100dvh로 모바일 주소창 대응
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100dvh', fontFamily: "'Pretendard', sans-serif", overflow: 'hidden', backgroundColor: '#121212', color: 'white' }}>
      
      {/* --- 상단 헤더 영역 --- */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '50px', padding: '0 10px', backgroundColor: '#F2A900', borderBottom: '2px solid #cc8b00', zIndex: 6000, boxSizing: 'border-box' }}>
        {/* 왼쪽: 로고 + 맵 리스트 (모바일에서 스크롤되게 처리함) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
          {activeMapId !== 'Board' && (
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '18px', flexShrink: 0 }}>☰</button>
          )}
          <div onClick={() => handleTabClick('Erangel')} style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '900', fontStyle: 'italic', color: 'black', cursor: 'pointer', flexShrink: 0 }}>
            PUBG<span style={{ color: 'white' }}>MAP</span>
          </div>
          <nav style={{ display: 'flex', gap: '4px', overflowX: 'auto', scrollbarWidth: 'none', alignItems: 'center', msOverflowStyle: 'none' }}>
            {MAP_LIST.map(m => (
              <button key={m.id} onClick={() => handleTabClick(m.id)} style={{ height: '30px', padding: '0 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', backgroundColor: activeMapId === m.id ? '#1a1a1a' : 'transparent', color: activeMapId === m.id ? 'white' : 'black' }}>{m.label}</button>
            ))}
            <button onClick={() => handleTabClick('Board')} style={{ height: '30px', padding: '0 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', backgroundColor: activeMapId === 'Board' ? '#1a1a1a' : 'transparent', color: activeMapId === 'Board' ? '#F2A900' : 'black' }}>게시판</button>
          </nav>
        </div>
        
        {/* 오른쪽: 로그인/유저 정보 영역 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {currentUser ? (
            <>
              {/* 알림 아이콘 (안읽은 알림 있으면 빨간점) */}
              <div onClick={() => setShowNotiDropdown(!showNotiDropdown)} style={{ cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center' }}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="black"><path d={svgPaths.bell}/></svg>
                {notifications.some(n => !n.is_read) && <span style={{ position: 'absolute', top: 0, right: 0, width: '8px', height: '8px', backgroundColor: 'red', borderRadius: '50%' }}></span>}
              </div>
              {/* 마이페이지 진입 버튼 */}
              <div onClick={() => { setIsMyPage(true); router.push('/?tab=Board'); }} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="black"><path d={svgPaths.user}/></svg>
                </div>
                {!isMobile && <span style={{ fontWeight: 'bold', color: 'black', fontSize: '13px' }}>{displayName}</span>}
              </div>
            </>
          ) : (
            <Link href="/login" style={{ textDecoration: 'none', fontWeight: 'bold', color: 'black', fontSize: '12px', backgroundColor: 'white', padding: '5px 10px', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.1)' }}>로그인</Link>
          )}
        </div>
      </header>

      {/* --- 메인 콘텐츠 (지도 or 게시판) --- */}
      <main style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {activeMapId === 'Board' ? (
          // 게시판 또는 마이페이지 렌더링
          <div style={{ width: '100%', height: '100%', overflowY: 'auto', backgroundColor: '#0d0d0d' }}>
            <div style={{ maxWidth: '900px', margin: '0 auto', padding: isMobile ? '10px' : '20px' }}>
              {isMyPage ? (
                <MyPage currentUser={currentUser} userProfile={userProfile} setIsMyPage={setIsMyPage} fetchUserProfile={fetchUserProfile} />
              ) : (
                <Board currentUser={currentUser} displayName={displayName} />
              )}
            </div>
          </div>
        ) : (
          // 지도 렌더링
          <>
            {/* 왼쪽 사이드바: 모바일일땐 absolute로 지도 위로 띄워서 화면 가림 방지 */}
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

            {/* 실제 Leaflet 지도 컨테이너 */}
            <div style={{ flex: 1, position: 'relative' }}>
                <MapContainer 
                  key={activeMapId} // 맵 바뀔때마다 초기화
                  center={[imageHeight / 2, imageWidth / 2]} 
                  zoom={-3} 
                  minZoom={-4} 
                  maxZoom={2} 
                  crs={CRS.Simple} // 지구 좌표계 대신 평면 이미지 좌표계 사용
                  style={{ height: '100%', width: '100%', background: '#0b0f19' }} 
                  zoomControl={false}
                >
                    {currentMap && <ImageOverlay url={currentMap.imageUrl} bounds={bounds} />}
                    {/* filters[v.type]이 true인 마커들만 뽑아서 지도에 뿌려줌 */}
                    {STATIC_VEHICLES.filter(v => v.mapId === activeMapId && filters[v.type]).map(v => (
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