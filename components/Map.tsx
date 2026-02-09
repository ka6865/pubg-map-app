'use client';

import { useState } from 'react';
import { MapContainer, ImageOverlay, Marker, Popup } from 'react-leaflet';
import L, { CRS } from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ==============================================================================
// 1. 🎨 [디자인 자산] 아이콘 모양 정의 (SVG 경로)
// ==============================================================================
// 설명: 지도에 표시될 아이콘의 '그림' 데이터입니다.
// 이 복잡한 문자열들이 모여서 자동차, 보트, 글라이더 모양을 그립니다.
const svgPaths = {
  car: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
  boat: "M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.39-.6-.39H2.72c-.26 0-.5.15-.6.39s-.14.52-.06.78L3.95 19z",
  glider: "M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z",
  key: "M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"
};

// ==============================================================================
// 2. 🏭 [아이콘 공장] Leaflet 마커 생성 함수
// ==============================================================================
// 설명: 위에서 만든 그림(svgPaths)과 색상 코드(#)를 받아서
// 실제 지도 위에 꽂을 수 있는 '마커 객체(DivIcon)'를 만들어주는 함수입니다.
const createPinIcon = (colorCode: string, pathData: string) => {
  return L.divIcon({
    className: 'custom-pin-icon', // CSS 클래스 이름 (스타일링용)
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
    iconSize: [28, 38],   // 마커의 크기
    iconAnchor: [14, 38], // 마커가 찍힐 기준점 (가로 중앙, 세로 하단)
  });
};

// ==============================================================================
// 3. 📦 [아이콘 정의] 실제 사용할 아이콘들 미리 만들어두기
// ==============================================================================
const icons = {
  Garage: createPinIcon('#ef4444', svgPaths.car),      // 빨간색 차
  Random: createPinIcon('#f59e0b', svgPaths.car),      // 노란색 차
  Esports: createPinIcon('#a855f7', svgPaths.car),     // 보라색 차
  Boat: createPinIcon('#3b82f6', svgPaths.boat),       // 파란색 보트
  EsportsBoat: createPinIcon('#8b5cf6', svgPaths.boat),// 보라색 보트
  Glider: createPinIcon('#f97316', svgPaths.glider),   // 주황색 글라이더
  Key: createPinIcon('#10b981', svgPaths.key),         // 초록색 열쇠
};

// ==============================================================================
// 4. 🗺️ [맵 리스트] 상단 탭 메뉴 설정
// ==============================================================================
// 설명: 나중에 맵 이미지만 구하면 여기다가 추가해서 확장할 수 있습니다.
const MAP_LIST = [
  { id: 'Erangel', label: 'ERANGEL', imageUrl: '/Erangel.png' }, // 에란겔
  { id: 'Miramar', label: 'MIRAMAR', imageUrl: '/Miramar.png' }, // 미라마 (이미지 필요)
  { id: 'Taego', label: 'TAEGO', imageUrl: '/Taego.png' },       // 태이고 (이미지 필요)
  { id: 'Rondo', label: 'RONDO', imageUrl: '/Rondo.png' },       // 론도 (이미지 필요)
  { id: 'Vikendi', label: 'VIKENDI', imageUrl: '/Vikendi.png' }, // 비켄디 (이미지 필요)
];

// ==============================================================================
// 5. 💾 [데이터베이스] 지도에 찍힐 좌표 데이터
// ==============================================================================
// 설명: 관리자 페이지(MapEditor)에서 찍은 데이터를 여기에 붙여넣습니다.
// 지금은 'e스포츠 차량' 데이터만 들어있습니다. (차고지 찍고 여기에 추가하세요!)
const STATIC_VEHICLES = [
  {"id":1770372720563,"name":"고정 차량 (e스포츠)","x":1776,"y":6664,"type":"Esports"},{"id":1770372761981,"name":"고정 차량 (e스포츠)","x":2940,"y":6844,"type":"Esports"},{"id":1770372771630,"name":"고정 차량 (e스포츠)","x":4612,"y":7204,"type":"Esports"},{"id":1770372780213,"name":"고정 차량 (e스포츠)","x":5584,"y":7736,"type":"Esports"},{"id":1770372808715,"name":"고정 차량 (e스포츠)","x":1100,"y":6784,"type":"Esports"},{"id":1770372812881,"name":"고정 차량 (e스포츠)","x":1704,"y":5924,"type":"Esports"},{"id":1770372830265,"name":"고정 차량 (e스포츠)","x":3800,"y":6884,"type":"Esports"},{"id":1770372835864,"name":"고정 차량 (e스포츠)","x":6756,"y":7168,"type":"Esports"},{"id":1770372886632,"name":"고정 차량 (e스포츠)","x":5628,"y":6712,"type":"Esports"},{"id":1770372924482,"name":"고정 차량 (e스포츠)","x":5412,"y":5784,"type":"Esports"},{"id":1770372932200,"name":"고정 차량 (e스포츠)","x":4908,"y":6356,"type":"Esports"},{"id":1770372939333,"name":"고정 차량 (e스포츠)","x":3568,"y":5776,"type":"Esports"},{"id":1770372943132,"name":"고정 차량 (e스포츠)","x":2592,"y":5676,"type":"Esports"},{"id":1770372973766,"name":"고정 차량 (e스포츠)","x":3172,"y":4856,"type":"Esports"},{"id":1770372981600,"name":"고정 차량 (e스포츠)","x":2136,"y":4264,"type":"Esports"},{"id":1770372988016,"name":"고정 차량 (e스포츠)","x":1628,"y":4764,"type":"Esports"},{"id":1770373450124,"name":"고정 차량","x":992,"y":3664,"type":"Esports"},{"id":1770373454340,"name":"고정 차량","x":1016,"y":2856,"type":"Esports"},{"id":1770373466707,"name":"고정 차량","x":1492,"y":2120,"type":"Esports"},{"id":1770373471208,"name":"고정 차량","x":2980,"y":2788,"type":"Esports"},{"id":1770373477974,"name":"고정 차량","x":3760,"y":2224,"type":"Esports"},{"id":1770373492875,"name":"고정 차량","x":1752,"y":3596,"type":"Esports"},{"id":1770373507725,"name":"고정 차량","x":2716,"y":3896,"type":"Esports"},{"id":1770373512191,"name":"고정 차량","x":3704,"y":4036,"type":"Esports"},{"id":1770373524142,"name":"고정 차량","x":3772,"y":5176,"type":"Esports"},{"id":1770373529941,"name":"고정 차량","x":4084,"y":4724,"type":"Esports"},{"id":1770373536127,"name":"고정 차량","x":4492,"y":5068,"type":"Esports"},{"id":1770373539143,"name":"고정 차량","x":5232,"y":4408,"type":"Esports"},{"id":1770373551476,"name":"고정 차량","x":4316,"y":3500,"type":"Esports"},{"id":1770373558725,"name":"고정 차량","x":5176,"y":3588,"type":"Esports"},{"id":1770373562260,"name":"고정 차량","x":5844,"y":3468,"type":"Esports"},{"id":1770373578110,"name":"고정 차량","x":6672,"y":6428,"type":"Esports"},{"id":1770373583726,"name":"고정 차량","x":6064,"y":5560,"type":"Esports"},{"id":1770373586843,"name":"고정 차량","x":6884,"y":4960,"type":"Esports"},{"id":1770373593026,"name":"고정 차량","x":6432,"y":3956,"type":"Esports"},{"id":1770373599909,"name":"고정 차량","x":6992,"y":3468,"type":"Esports"},{"id":1770373615827,"name":"고정 차량","x":4472,"y":1632,"type":"Esports"},{"id":1770373618809,"name":"고정 차량","x":4368,"y":1108,"type":"Esports"},{"id":1770373622576,"name":"고정 차량","x":5524,"y":2208,"type":"Esports"},{"id":1770373628460,"name":"고정 차량","x":6040,"y":1960,"type":"Esports"},{"id":1770373661444,"name":"고정 차량","x":1418,"y":5280,"type":"Esports"}
];

// ==============================================================================
// 6. 🚀 [메인 컴포넌트] 화면 그리기 시작!
// ==============================================================================
const Map = () => {
  // 맵 크기 설정 (8192x8192는 배그 맵의 표준 해상도)
  const imageWidth = 8192;
  const imageHeight = 8192;
  const bounds: [[number, number], [number, number]] = [[0, 0], [imageHeight, imageWidth]];
  
  // 🧠 [상태 관리] "지금 사용자가 무엇을 보고 있는가?"
  const [activeMapId, setActiveMapId] = useState('Erangel'); // 현재 맵 (기본: 에란겔)
  
  // 필터 상태 (true: 켜짐, false: 꺼짐) - 기본값은 전부 꺼둠
  const [filters, setFilters] = useState<{ [key: string]: boolean }>({
    Garage: false, Random: false, Esports: true, Boat: false, EsportsBoat: false, Glider: false, Key: false,
  });

  // 사이드바 메뉴 설정 (라벨, 색상, 아이콘 연결)
  const categories = [
    { id: 'Garage', label: 'GARAGE', color: '#ef4444', path: svgPaths.car },
    { id: 'Random', label: 'VEHICLE', color: '#f59e0b', path: svgPaths.car },
    { id: 'Esports', label: 'ESPORTS', color: '#a855f7', path: svgPaths.car },
    { id: 'Boat', label: 'BOAT', color: '#3b82f6', path: svgPaths.boat },
    { id: 'EsportsBoat', label: 'BOAT(E)', color: '#8b5cf6', path: svgPaths.boat },
    { id: 'Glider', label: 'GLIDER', color: '#f97316', path: svgPaths.glider },
    { id: 'Key', label: 'KEY', color: '#10b981', path: svgPaths.key },
  ];

  // 🖱️ [기능] 필터 토글 함수 (클릭하면 켜졌다 꺼졌다 함)
  const toggleFilter = (id: string) => setFilters(prev => ({ ...prev, [id]: !prev[id] }));
  
  // 🧮 [기능] 마커 개수 세기 (에란겔일 때만 작동하도록 안전장치)
  const getCount = (type: string) => {
    if (activeMapId !== 'Erangel') return 0;
    return STATIC_VEHICLES.filter(v => v.type === type).length;
  };

  // 현재 선택된 맵 정보 가져오기
  const currentMap = MAP_LIST.find(m => m.id === activeMapId) || MAP_LIST[0];

  return (
    // 🎨 [레이아웃] 전체 컨테이너 (무적의 다크모드 스타일 적용)
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', fontFamily: 'sans-serif', overflow: 'hidden', backgroundColor: 'black', color: 'white' }}>
      
      {/* ============================================================================== */}
      {/* 🟢 [상단 헤더] 로고 및 맵 선택 탭 */}
      {/* ============================================================================== */}
      <header style={{ 
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
          width: '100%', height: '60px', flexShrink: 0, zIndex: 6000, 
          padding: '0 20px', backgroundColor: '#F2A900', borderBottom: '2px solid #cc8b00', boxSizing: 'border-box'
        }}>
        
        {/* 왼쪽: 로고 + 탭 */}
        <div style={{ display: 'flex', alignItems: 'center', height: '100%', gap: '30px' }}>
          <div style={{ fontSize: '24px', fontWeight: '900', fontStyle: 'italic', color: 'black', cursor: 'pointer', letterSpacing: '-1px' }}>
            PUBG<span style={{ color: 'white' }}>MAP</span>
          </div>

          {/* 맵 선택 버튼들 (Erangel, Miramar...) */}
          <nav style={{ display: 'flex', alignItems: 'center', height: '100%', gap: '5px' }}>
            {MAP_LIST.map((map) => (
              <button
                key={map.id}
                onClick={() => setActiveMapId(map.id)}
                style={{
                  height: '40px', padding: '0 20px', borderRadius: '4px',
                  fontWeight: 'bold', fontSize: '14px', textTransform: 'uppercase',
                  border: 'none', cursor: 'pointer',
                  // 선택된 탭은 검은색 배경, 아니면 투명
                  backgroundColor: activeMapId === map.id ? '#1a1a1a' : 'transparent',
                  color: activeMapId === map.id ? 'white' : 'black',
                  boxShadow: activeMapId === map.id ? '0 2px 4px rgba(0,0,0,0.2)' : 'none',
                }}
              >
                {map.label}
              </button>
            ))}
          </nav>
        </div>

        {/* 오른쪽: 가짜 메뉴 (디자인용) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', color: 'black', fontWeight: 'bold', fontSize: '14px' }}>
          <span style={{ cursor: 'pointer' }}>LOGIN</span>
          <button style={{ backgroundColor: 'black', color: 'white', padding: '8px 16px', borderRadius: '4px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>
            APP DOWNLOAD
          </button>
        </div>
      </header>


      {/* ============================================================================== */}
      {/* 🟠 [중앙 영역] 사이드바 + 지도 */}
      {/* ============================================================================== */}
      <div style={{ display: 'flex', flex: 1, width: '100%', overflow: 'hidden', position: 'relative' }}>
        
        {/* --- [왼쪽 사이드바] 컨트롤 패널 --- */}
        <aside style={{ 
            width: '300px', display: 'flex', flexDirection: 'column', 
            borderRight: '1px solid #333', boxShadow: '4px 0 15px rgba(0,0,0,0.5)', 
            flexShrink: 0, zIndex: 5000, backgroundColor: '#121212' 
          }}>
          
          {/* 사이드바 제목 */}
          <div style={{ padding: '20px', borderBottom: '1px solid #333', backgroundColor: '#1a1a1a' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900', fontStyle: 'italic', letterSpacing: '2px', textTransform: 'uppercase', color: '#F2A900' }}>
                {currentMap.label}
              </h2>
              <span style={{ fontSize: '10px', backgroundColor: '#333', padding: '4px 8px', borderRadius: '4px', color: '#aaa', fontWeight: 'bold' }}>
                LIVE
              </span>
            </div>
            <p style={{ margin: '5px 0 0 0', color: '#888', fontSize: '12px', fontWeight: '500' }}>
              Interactive Tactical Map
            </p>
          </div>

          {/* 필터 목록 (카테고리 버튼들) */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {categories.map((cat) => (
              <div key={cat.id} 
                onClick={() => toggleFilter(cat.id)}
                style={{ 
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px', borderRadius: '6px', cursor: 'pointer',
                  border: '1px solid transparent',
                  // 필터 켜짐/꺼짐에 따른 스타일 변화
                  backgroundColor: filters[cat.id] ? '#252525' : 'transparent',
                  borderLeft: filters[cat.id] ? `4px solid ${cat.color}` : '4px solid transparent',
                  opacity: filters[cat.id] ? 1 : 0.7
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* 아이콘 박스 */}
                  <div style={{ 
                      width: '32px', height: '32px', borderRadius: '4px', 
                      backgroundColor: '#1a1a1a', border: '1px solid #333',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" 
                         style={{ fill: filters[cat.id] ? cat.color : '#666' }}>
                      <path d={cat.path} />
                    </svg>
                  </div>
                  {/* 라벨 */}
                  <span style={{ fontWeight: 'bold', fontSize: '14px', letterSpacing: '0.5px', color: filters[cat.id] ? 'white' : '#888' }}>
                    {cat.label}
                  </span>
                </div>
                {/* 개수 표시 */}
                <span style={{ 
                    fontSize: '12px', fontWeight: 'bold', fontFamily: 'monospace',
                    padding: '2px 8px', borderRadius: '4px',
                    backgroundColor: filters[cat.id] ? '#F2A900' : '#1a1a1a',
                    color: filters[cat.id] ? 'black' : '#666'
                  }}>
                  {getCount(cat.id)}
                </span>
              </div>
            ))}
          </div>

          {/* 광고 영역 (구색 맞추기) */}
          <div style={{ padding: '15px', backgroundColor: '#1a1a1a', borderTop: '1px solid #333' }}>
             <div style={{ width: '100%', height: '80px', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#121212', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: '12px', fontWeight: 'bold' }}>
                AD SPACE
             </div>
          </div>
        </aside>

        {/* --- [메인 지도] --- */}
        <main style={{ flex: 1, position: 'relative', height: '100%', backgroundColor: '#0b0f19' }}>
          <MapContainer 
            key={activeMapId} // 맵이 바뀌면 강제로 새로고침
            center={[imageHeight / 2, imageWidth / 2]} 
            zoom={-3} minZoom={-4} maxZoom={2} 
            crs={CRS.Simple} 
            style={{ height: '100%', width: '100%', background: '#0b0f19' }}
            zoomControl={false}
          >
            <ImageOverlay url={currentMap.imageUrl} bounds={bounds} />
            
            {/* 마커 렌더링: 에란겔이면서 & 필터가 켜진 것들만 그리기 */}
            {activeMapId === 'Erangel' && STATIC_VEHICLES
              .filter((v) => filters[v.type])
              .map((vehicle) => (
              <Marker
                key={vehicle.id}
                position={[vehicle.y, vehicle.x]}
                draggable={false} 
                icon={icons[vehicle.type as keyof typeof icons]}
              >
                 <Popup className="custom-popup">
                   <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '12px', color: 'black' }}>
                     {vehicle.name}
                   </div>
                 </Popup>
              </Marker>
            ))}
          </MapContainer>
        </main>

      </div>
    </div>
  );
};

export default Map;