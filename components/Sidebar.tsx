'use client';

// 아이콘 SVG 경로 데이터 정의 (지도 마커 및 사이드바 아이콘 공용)
const svgPaths = {
  car: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
  boat: "M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.39-.6-.39H2.72c-.26 0-.5.15-.6.39s-.14.52-.06.78L3.95 19z",
  glider: "M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z",
  key: "M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z",
};

// 카테고리별 UI 표시 색상 매핑
const CATEGORY_COLORS: { [key: string]: string } = {
  Garage: '#ef4444', Random: '#f59e0b', Esports: '#a855f7',
  Boat: '#3b82f6', EsportsBoat: '#8b5cf6', Glider: '#f97316', Key: '#10b981',
};

// Sidebar 컴포넌트 Props 타입 정의
interface SidebarProps {
  isOpen: boolean;                      // 사이드바 열림/닫힘 상태
  setIsOpen: (v: boolean) => void;      // 사이드바 상태 변경 함수
  mapLabel: string;                     // 현재 선택된 맵 이름 (예: 에란겔)
  filters: { [key: string]: boolean };  // 필터 활성화 상태 객체
  toggleFilter: (id: string) => void;   // 필터 토글 핸들러
  getCount: (id: string) => number;     // 해당 카테고리의 마커 개수 반환 함수
}

export default function Sidebar({ isOpen, setIsOpen, mapLabel, filters, toggleFilter, getCount }: SidebarProps) {
  return (
    <aside style={{ 
        width: '260px', backgroundColor: '#1a1a1a', borderRight: '1px solid #333', 
        display: isOpen ? 'flex' : 'none', flexDirection: 'column', flexShrink: 0, zIndex: 5000 
      }}>
      {/* 사이드바 헤더: 맵 이름 표시 및 닫기 버튼 */}
      <div style={{ padding: '20px 15px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '20px', color: '#F2A900', fontWeight: '900', letterSpacing: '-0.5px' }}>{mapLabel}</h2>
        <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '20px' }}>✕</button>
      </div>

      {/* 필터 리스트 영역 */}
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
            backgroundColor: filters[item.id] ? '#252525' : 'transparent', // 활성화 시 배경색 변경
            borderLeft: filters[item.id] ? `4px solid ${item.color}` : '4px solid transparent', // 활성화 시 좌측 컬러바 표시
            transition: 'all 0.15s ease' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill={filters[item.id] ? item.color : "#555"}><path d={item.path}/></svg>
              <span style={{ fontSize: '14px', color: filters[item.id] ? 'white' : '#777', fontWeight: filters[item.id] ? 'bold' : 'normal' }}>{item.label}</span>
            </div>
            {/* 개수 표시 뱃지 */}
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: filters[item.id] ? item.color : '#2a2a2a', color: filters[item.id] ? (item.id === 'Esports' ? 'white' : 'black') : '#666', fontWeight: 'bold' }}>{getCount(item.id)}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}