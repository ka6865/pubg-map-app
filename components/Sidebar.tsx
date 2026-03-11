'use client';

import { CATEGORY_INFO, MAP_CATEGORIES } from '../lib/map_config';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  mapLabel: string;
  activeMapId: string; // 💡 맵 ID를 추가로 받습니다.
  filters: { [key: string]: boolean };
  toggleFilter: (id: string) => void;
  getCount: (id: string) => number;
}

export default function Sidebar({ isOpen, setIsOpen, mapLabel, activeMapId, filters, toggleFilter, getCount }: SidebarProps) {
  // 현재 맵에 해당하는 카테고리 배열 가져오기 (없으면 에란겔 기준)
  const currentCategories = MAP_CATEGORIES[activeMapId] || MAP_CATEGORIES['Erangel'];

  return (
    <aside style={{ 
        width: '260px', backgroundColor: '#1a1a1a', borderRight: '1px solid #333', 
        display: isOpen ? 'flex' : 'none', flexDirection: 'column', flexShrink: 0, zIndex: 5000 
      }}>
      <div style={{ padding: '20px 15px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '20px', color: '#F2A900', fontWeight: '900', letterSpacing: '-0.5px' }}>{mapLabel}</h2>
        <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '20px' }}>✕</button>
      </div>

      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {/* 설정집에서 가져온 데이터로 동적 렌더링 */}
        {currentCategories.map(id => {
          const item = CATEGORY_INFO[id];
          if (!item) return null;
          
          return (
            <div key={id} onClick={() => toggleFilter(id)} style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', borderRadius: '8px', cursor: 'pointer', 
              backgroundColor: filters[id] ? '#252525' : 'transparent',
              borderLeft: filters[id] ? `4px solid ${item.color}` : '4px solid transparent',
              transition: 'all 0.15s ease' 
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill={filters[id] ? item.color : "#555"}><path d={item.path}/></svg>
                <span style={{ fontSize: '14px', color: filters[id] ? 'white' : '#777', fontWeight: filters[id] ? 'bold' : 'normal' }}>{item.label}</span>
              </div>
              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: filters[id] ? item.color : '#2a2a2a', color: filters[id] ? '#fff' : '#666', fontWeight: 'bold', textShadow: filters[id] ? '0px 1px 2px rgba(0,0,0,0.5)' : 'none' }}>
                {getCount(id)}
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}