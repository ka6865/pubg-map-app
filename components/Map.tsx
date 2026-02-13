'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { MapContainer, ImageOverlay, Marker, Popup } from 'react-leaflet';
import L, { CRS } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { STATIC_VEHICLES } from '../data/vehicles';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

// 하위 컴포넌트 임포트
import Sidebar from './Sidebar';
import Board from './Board';
import MyPage from './MyPage';

// 공용 아이콘 데이터
const svgPaths = {
  bell: "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
  user: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
};

const CATEGORY_COLORS: { [key: string]: string } = {
  Garage: '#ef4444',     // 차고지 (빨강)
  Random: '#f59e0b',     // 일반 차량 (노랑)
  Esports: '#a855f7',    // 대회 고정 (보라)
  Boat: '#3b82f6',       // 보트 (파랑)
  EsportsBoat: '#8b5cf6',// 대회 보트 (연보라)
  Glider: '#f97316',     // 글라이더 (주황)
  Key: '#10b981',        // 열쇠 (초록)
};

// 핀 아이콘 디자인 데이터 (SVG 경로)
const pinSvgPaths = {
  car: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
  boat: "M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.39-.6-.39H2.72c-.26 0-.5.15-.6.39s-.14.52-.06.78L3.95 19z",
  glider: "M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z",
  key: "M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"
};

// 지도 핀 아이콘 생성 함수 (Leaflet DivIcon)
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
  const activeMapId = searchParams?.get('tab') || 'Erangel';

  // UI 상태 관리
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [showNotiDropdown, setShowNotiDropdown] = useState(false);
  const [isMyPage, setIsMyPage] = useState(false);

  // 데이터 상태 관리
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [filters, setFilters] = useState<{ [key: string]: boolean }>({
    Garage: false, Random: false, Esports: true, Boat: false, EsportsBoat: false, Glider: false, Key: false,
  });

  const displayName = useMemo(() => {
    if (userProfile?.nickname) return userProfile.nickname;
    if (currentUser?.email) return currentUser.email.split('@')[0];
    return '익명';
  }, [userProfile, currentUser]);

  const toggleFilter = (id: string) => setFilters(prev => ({ ...prev, [id]: !prev[id] }));
  const getCount = (type: string) => STATIC_VEHICLES.filter(v => v.mapId === activeMapId && v.type === type).length;

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
        } else {
          setCurrentUser(null);
          setUserProfile(null);
        }
      });
    };
    initAuth();
  }, []);

  const fetchUserProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) setUserProfile(data);
    else {
        const initialNickname = currentUser?.email?.split('@')[0] || '익명';
        await supabase.from('profiles').insert([{ id: userId, nickname: initialNickname }]);
        setUserProfile({ nickname: initialNickname });
    }
  };

  const fetchNotifications = async (userId: string) => {
    const { data } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (data) setNotifications(data);
  };

  const handleTabClick = (tabId: string) => {
    setIsMyPage(false);
    router.push(`/?tab=${tabId}`);
  };

  const currentMap = MAP_LIST.find(m => m.id === activeMapId);
  const imageWidth = 8192; 
  const imageHeight = 8192;
  const bounds: [[number, number], [number, number]] = [[0, 0], [imageHeight, imageWidth]];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', fontFamily: "'Pretendard', sans-serif", overflow: 'hidden', backgroundColor: '#121212', color: 'white' }}>
      
      {/* 1. 상단 헤더 */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '50px', padding: '0 15px', backgroundColor: '#F2A900', borderBottom: '2px solid #cc8b00', zIndex: 6000 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {activeMapId !== 'Board' && <button onClick={() => setSidebarOpen(!isSidebarOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>☰</button>}
          <div onClick={() => handleTabClick('Erangel')} style={{ fontSize: '20px', fontWeight: '900', fontStyle: 'italic', color: 'black', cursor: 'pointer' }}>PUBG<span style={{ color: 'white' }}>MAP</span></div>
          <nav style={{ display: 'flex', gap: '5px' }}>
            {MAP_LIST.map(m => (
              <button key={m.id} onClick={() => handleTabClick(m.id)} style={{ padding: '0 12px', height: '34px', borderRadius: '4px', fontWeight: 'bold', border: 'none', backgroundColor: activeMapId === m.id ? '#1a1a1a' : 'transparent', color: activeMapId === m.id ? 'white' : 'black', cursor: 'pointer' }}>{m.label}</button>
            ))}
            <button onClick={() => handleTabClick('Board')} style={{ padding: '0 12px', height: '34px', borderRadius: '4px', fontWeight: 'bold', border: 'none', backgroundColor: activeMapId === 'Board' ? '#1a1a1a' : 'transparent', color: activeMapId === 'Board' ? '#F2A900' : 'black', cursor: 'pointer' }}>게시판</button>
          </nav>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {currentUser ? (
            <>
              {/* 알림 아이콘 */}
              <div onClick={() => setShowNotiDropdown(!showNotiDropdown)} style={{ cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center' }}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="black"><path d={svgPaths.bell}/></svg>
                {notifications.some(n => !n.is_read) && <span style={{ position: 'absolute', top: 0, right: 0, width: '8px', height: '8px', backgroundColor: 'red', borderRadius: '50%' }}></span>}
              </div>
              
              {/* 프로필 바로가기 */}
              <div onClick={() => { setIsMyPage(true); router.push('/?tab=Board'); }} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="black"><path d={svgPaths.user}/></svg>
                </div>
                <span style={{ fontWeight: 'bold', color: 'black' }}>{displayName}</span>
              </div>
            </>
          ) : (
            <Link href="/login" style={{ fontWeight: 'bold', color: 'black' }}>로그인</Link>
          )}
        </div>
      </header>

      {/* 2. 메인 컨텐츠 영역 */}
      <main style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {activeMapId === 'Board' ? (
          <div style={{ width: '100%', height: '100%', overflowY: 'auto', backgroundColor: '#0d0d0d' }}>
            <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
              {isMyPage ? (
                <MyPage currentUser={currentUser} userProfile={userProfile} setIsMyPage={setIsMyPage} fetchUserProfile={fetchUserProfile} />
              ) : (
                <Board currentUser={currentUser} displayName={displayName} />
              )}
            </div>
          </div>
        ) : (
          <>
            <Sidebar isOpen={isSidebarOpen} setIsOpen={setSidebarOpen} mapLabel={currentMap?.label || ''} filters={filters} toggleFilter={toggleFilter} getCount={getCount} />
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
                    {currentMap && <ImageOverlay url={currentMap.imageUrl} bounds={bounds} />}
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