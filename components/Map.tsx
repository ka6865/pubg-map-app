'use client';

import { useState, useEffect } from 'react';
import { MapContainer, ImageOverlay, Marker, Popup } from 'react-leaflet';
import L, { CRS } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { STATIC_VEHICLES } from '../data/vehicles';
import Link from 'next/link';

// ==============================================================================
// 1. 🎨 [디자인 자산] 아이콘 정의 (그대로 유지)
// ==============================================================================
const svgPaths = {
  car: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
  boat: "M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.39-.6-.39H2.72c-.26 0-.5.15-.6.39s-.14.52-.06.78L3.95 19z",
  glider: "M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z",
  key: "M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"
};

const createPinIcon = (colorCode: string, pathData: string) => {
  return L.divIcon({
    className: 'custom-pin-icon',
    html: `<div style="position: relative; width: 28px; height: 38px;"><svg viewBox="0 0 30 42" style="width: 100%; height: 100%; filter: drop-shadow(0 3px 4px rgba(0,0,0,0.8));"><path d="M15 0C6.7 0 0 6.7 0 15c0 8.3 15 27 15 27s15-18.7 15-27C30 6.7 23.3 0 15 0z" fill="${colorCode}" stroke="#ffffff" stroke-width="2"/></svg><div style="position: absolute; top: 0; left: 0; width: 100%; height: 26px; display: flex; align-items: center; justify-content: center;"><svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: white;"><path d="${pathData}"/></svg></div></div>`,
    iconSize: [28, 38],
    iconAnchor: [14, 38],
  });
};

const icons = {
  Garage: createPinIcon('#ef4444', svgPaths.car),
  Random: createPinIcon('#f59e0b', svgPaths.car),
  Esports: createPinIcon('#a855f7', svgPaths.car),
  Boat: createPinIcon('#3b82f6', svgPaths.boat),
  EsportsBoat: createPinIcon('#8b5cf6', svgPaths.boat),
  Glider: createPinIcon('#f97316', svgPaths.glider),
  Key: createPinIcon('#10b981', svgPaths.key),
};

const MAP_LIST = [
  { id: 'Erangel', label: '에란겔', imageUrl: '/Erangel.jpg' },
  { id: 'Miramar', label: '미라마', imageUrl: '/Miramar.jpg' },
  { id: 'Taego', label: '태이고', imageUrl: '/Taego.jpg' },
  { id: 'Rondo', label: '론도', imageUrl: '/Rondo.jpg' },
  { id: 'Vikendi', label: '비켄디', imageUrl: '/Vikendi.jpg' },
];

const MOCK_POSTS = [
  { id: 1, title: '에란겔 꿀잼 차고지', author: '배그왕', time: '방금전', views: 120 },
  { id: 2, title: '미라마 글라이더 고정젠?', author: '뉴비', time: '10분전', views: 45 },
  { id: 3, title: '같이 듀오 하실분 (2000+)', author: '여포', time: '1시간전', views: 300 },
  { id: 4, title: '이번 패치 노트 봤음?', author: '운영자', time: '어제', views: 1500 },
  { id: 5, title: '태이고 비밀의 방 위치 공유', author: '파밍장인', time: '어제', views: 520 },
  { id: 6, title: '론도 신규 차량 성능 테스트', author: '차량전문가', time: '2일전', views: 890 },
];

const Map = () => {
  const imageWidth = 8192;
  const imageHeight = 8192;
  const bounds: [[number, number], [number, number]] = [[0, 0], [imageHeight, imageWidth]];
  
  // 🌟 activeMapId가 'Board'면 게시판을 보여줍니다.
  const [activeMapId, setActiveMapId] = useState('Erangel');
  
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
        setIsMobile(true);
      } else {
        setSidebarOpen(true);
        setIsMobile(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [filters, setFilters] = useState<{ [key: string]: boolean }>({
    Garage: false, Random: false, Esports: true, Boat: false, EsportsBoat: false, Glider: false, Key: false,
  });

  const categories = [
    { id: 'Garage', label: '차고지', color: '#ef4444', path: svgPaths.car },
    { id: 'Random', label: '일반 차량', color: '#f59e0b', path: svgPaths.car },
    { id: 'Esports', label: '대회 고정', color: '#a855f7', path: svgPaths.car },
    { id: 'Boat', label: '보트', color: '#3b82f6', path: svgPaths.boat },
    { id: 'EsportsBoat', label: '대회 보트', color: '#8b5cf6', path: svgPaths.boat },
    { id: 'Glider', label: '글라이더', color: '#f97316', path: svgPaths.glider },
    { id: 'Key', label: '비밀 열쇠', color: '#10b981', path: svgPaths.key },
  ];

  const toggleFilter = (id: string) => setFilters(prev => ({ ...prev, [id]: !prev[id] }));
  const getCount = (type: string) => STATIC_VEHICLES.filter(v => v.mapId === activeMapId).filter(v => v.type === type).length;
  const currentMap = MAP_LIST.find(m => m.id === activeMapId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', fontFamily: "'Pretendard', sans-serif", overflow: 'hidden', backgroundColor: 'black', color: 'white' }}>
      
      {/* 🟢 상단 헤더 */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '50px', flexShrink: 0, zIndex: 6000, padding: '0 10px', backgroundColor: '#F2A900', borderBottom: '2px solid #cc8b00', boxSizing: 'border-box' }}>
        
        {/* 왼쪽: 로고 (게시판일 땐 메뉴 버튼 숨김) */}
        <div style={{ display: 'flex', alignItems: 'center', height: '100%', gap: '10px' }}>
          {activeMapId !== 'Board' && (
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px' }}>
               <svg viewBox="0 0 24 24" width="24" height="24" fill="black"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
            </button>
          )}
          <div style={{ fontSize: '20px', fontWeight: '900', fontStyle: 'italic', color: 'black', cursor: 'pointer', letterSpacing: '-1px' }}>
            PUBG<span style={{ color: 'white' }}>MAP</span>
          </div>
        </div>

        {/* 🌟 중앙: 맵 선택 + 게시판 탭 */}
        <nav style={{ display: 'flex', alignItems: 'center', height: '100%', gap: '5px', overflowX: 'auto', flex: 1, padding: '0 10px', maxWidth: isMobile ? '40%' : '60%', scrollbarWidth: 'none' }}>
          {MAP_LIST.map((map) => (
            <button
              key={map.id}
              onClick={() => setActiveMapId(map.id)}
              style={{
                height: '34px', padding: '0 12px', borderRadius: '4px', fontWeight: 'bold', fontSize: '13px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                backgroundColor: activeMapId === map.id ? '#1a1a1a' : 'transparent',
                color: activeMapId === map.id ? 'white' : 'black',
              }}
            >
              {map.label}
            </button>
          ))}
          
          {/* 구분선 */}
          <div style={{ width: '1px', height: '20px', backgroundColor: 'rgba(0,0,0,0.2)', margin: '0 5px' }}></div>

          {/* 🌟 게시판 탭 (비켄디 바로 옆) */}
          <button
            onClick={() => setActiveMapId('Board')}
            style={{
              height: '34px', padding: '0 12px', borderRadius: '4px', fontWeight: 'bold', fontSize: '13px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              backgroundColor: activeMapId === 'Board' ? '#1a1a1a' : 'transparent', // 선택되면 검은 배경
              color: activeMapId === 'Board' ? '#F2A900' : 'black',                 // 선택되면 노란 글씨
            }}
          >
            게시판
          </button>
        </nav>

        {/* 오른쪽: 로그인 버튼 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link href="/login" style={{ textDecoration: 'none', color: 'black', fontWeight: 'bold', fontSize: '12px', padding: '5px 8px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.2)' }}>
            로그인
          </Link>
        </div>
      </header>

      {/* 🟠 중앙 영역 */}
      <div style={{ display: 'flex', flex: 1, width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
        
        {/* 1. 왼쪽 사이드바 (지도를 볼 때만 나옴) */}
        {activeMapId !== 'Board' && (
          <aside style={{ 
              position: 'absolute', left: 0, top: 0, bottom: 0, width: '260px', 
              backgroundColor: 'rgba(18, 18, 18, 0.95)', backdropFilter: 'blur(10px)',
              borderRight: '1px solid #333', boxShadow: '4px 0 15px rgba(0,0,0,0.5)', 
              zIndex: 5000, display: 'flex', flexDirection: 'column',
              transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.3s ease-in-out',
            }}>
            <div style={{ padding: '15px', borderBottom: '1px solid #333', backgroundColor: 'rgba(26, 26, 26, 0.9)', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#F2A900' }}>{currentMap?.label}</h2>
                <p style={{ margin: '5px 0 0 0', color: '#888', fontSize: '11px' }}>차량 필터 설정</p>
              </div>
              <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {categories.map((cat) => (
                <div key={cat.id} onClick={() => toggleFilter(cat.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', borderRadius: '6px', cursor: 'pointer', backgroundColor: filters[cat.id] ? '#252525' : 'transparent', borderLeft: filters[cat.id] ? `4px solid ${cat.color}` : '4px solid transparent', opacity: filters[cat.id] ? 1 : 0.7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '4px', backgroundColor: '#1a1a1a', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg viewBox="0 0 24 24" width="16" height="16" style={{ fill: filters[cat.id] ? cat.color : '#666' }}><path d={cat.path} /></svg>
                    </div>
                    <span style={{ fontWeight: 'bold', fontSize: '13px', color: filters[cat.id] ? 'white' : '#888' }}>{cat.label}</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', backgroundColor: filters[cat.id] ? '#F2A900' : '#1a1a1a', color: filters[cat.id] ? 'black' : '#666' }}>{getCount(cat.id)}</span>
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* 🌟 메인 컨텐츠 (지도 OR 게시판) */}
        <main style={{ flex: 1, position: 'relative', height: '100%', width: '100%', backgroundColor: '#0b0f19' }}>
          
          {/* CASE 1: 게시판 화면 */}
          {activeMapId === 'Board' ? (
            <div style={{ width: '100%', height: '100%', overflowY: 'auto', padding: '20px', boxSizing: 'border-box' }}>
              <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: 'white' }}>📢 자유 게시판</h1>
                  <button style={{ padding: '10px 20px', backgroundColor: '#F2A900', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>글쓰기</button>
                </div>
                
                {/* 게시글 목록 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {MOCK_POSTS.map((post) => (
                    <div key={post.id} style={{ padding: '20px', backgroundColor: '#1a1a1a', borderRadius: '8px', border: '1px solid #333', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '5px', color: 'white' }}>{post.title}</div>
                        <div style={{ fontSize: '12px', color: '#888' }}>
                          <span style={{ color: '#F2A900', fontWeight: 'bold' }}>{post.author}</span> · {post.time}
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', color: '#666', textAlign: 'right' }}>
                        조회 {post.views}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            // CASE 2: 지도 화면
            <>
              {!isSidebarOpen && (
                <button onClick={() => setSidebarOpen(true)} style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 4000, backgroundColor: '#F2A900', border: '2px solid white', borderRadius: '50%', width: '45px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', cursor: 'pointer' }}>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="black"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>
                </button>
              )}
              <MapContainer key={activeMapId} center={[imageHeight / 2, imageWidth / 2]} zoom={-3} minZoom={-4} maxZoom={2} crs={CRS.Simple} style={{ height: '100%', width: '100%', background: '#0b0f19' }} zoomControl={false}>
                {currentMap && <ImageOverlay url={currentMap.imageUrl} bounds={bounds} />}
                {STATIC_VEHICLES.filter((v) => v.mapId === activeMapId).filter((v) => filters[v.type]).map((vehicle) => (
                  <Marker key={vehicle.id} position={[vehicle.y, vehicle.x]} draggable={false} icon={icons[vehicle.type as keyof typeof icons]}>
                     <Popup className="custom-popup"><div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '12px', color: 'black' }}>{vehicle.name}</div></Popup>
                  </Marker>
                ))}
              </MapContainer>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default Map;