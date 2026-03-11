// components/MapEditor.tsx 전체 덮어쓰기
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { MapContainer, ImageOverlay, Marker, useMapEvents } from 'react-leaflet';
import L, { CRS } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';
import { CATEGORY_INFO, MAP_CATEGORIES } from '../lib/map_config';
import { LOCAL_MARKERS } from '../lib/local_data'; // 💡 로컬 테스트 데이터 임포트

const createPinIcon = (colorCode: string, pathData: string) => {
  return L.divIcon({
    className: 'custom-pin-icon',
    html: `
      <div style="position: relative; width: 24px; height: 32px;">
        <svg viewBox="0 0 30 42" style="width: 100%; height: 100%; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3));">
          <path d="M15 0C6.7 0 0 6.7 0 15c0 8.3 15 27 15 27s15-18.7 15-27C30 6.7 23.3 0 15 0z" fill="${colorCode}"/>
        </svg>
        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 22px; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: white;">
            <path d="${pathData}"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [24, 32],
    iconAnchor: [12, 32],
  });
};

const MAP_LIST = [
  { id: 'Erangel', label: '에란겔', imageUrl: '/Erangel.jpg' },
  { id: 'Miramar', label: '미라마', imageUrl: '/Miramar.jpg' },
  { id: 'Taego', label: '태이고', imageUrl: '/Taego.jpg' },
  { id: 'Rondo', label: '론도', imageUrl: '/Rondo.jpg' },
  { id: 'Vikendi', label: '비켄디', imageUrl: '/Vikendi.jpg' },
  { id: 'Deston', label: '데스턴', imageUrl: '/Deston.jpg' },
];

const MapEvents = ({ onClick }: { onClick: (e: L.LeafletMouseEvent) => void }) => {
  useMapEvents({ click: onClick });
  return null;
};

const MapEditorComponent = () => {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [activeMapId, setActiveMapId] = useState('Erangel');
  const [isSaving, setIsSaving] = useState(false);
  
  const currentMap = MAP_LIST.find(m => m.id === activeMapId);
  const mapImageUrl = currentMap?.imageUrl || '/Erangel.jpg';

  const imageWidth = 8192;
  const imageHeight = 8192;
  const bounds: [[number, number], [number, number]] = [[0, 0], [imageHeight, imageWidth]];

  const icons = useMemo(() => {
    const res: Record<string, L.DivIcon> = {};
    Object.keys(CATEGORY_INFO).forEach(key => {
      res[key] = createPinIcon(CATEGORY_INFO[key].color, CATEGORY_INFO[key].path);
    });
    return res;
  }, []);

  const [activeType, setActiveType] = useState<string>('Esports'); // 🚨 Random 대신 Esports 기본값
  const [filters, setFilters] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    Object.keys(CATEGORY_INFO).forEach(k => init[k] = true);
    return init;
  });

  const [isLoaded, setIsLoaded] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);

  const allowedCategories = MAP_CATEGORIES[activeMapId] || MAP_CATEGORIES['Erangel'];
  useEffect(() => {
    if (!allowedCategories.includes(activeType) && allowedCategories.length > 0) {
      setActiveType(allowedCategories[0]); 
    }
  }, [activeMapId, activeType, allowedCategories]);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { alert('관리자 로그인이 필요합니다.'); router.push('/login'); return; }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (profile?.role !== 'admin') { alert('관리자 권한이 없습니다.'); router.push('/'); return; }

      setIsAuthorized(true);

      const { data } = await supabase.from('map_markers').select('*');
      
      // 💡 1. DB 데이터 가져오기
      let combined = data ? data.map(v => ({ ...v, mapId: v.map_id })) : [];
      
      // 💡 2. 로컬 테스트용 데이터를 병합 (DB에 없는 ID만 추가)
      LOCAL_MARKERS.forEach(lm => {
        if (!combined.find(v => v.id === lm.id)) {
          combined.push(lm);
        }
      });

      // DB에 하나도 없으면 로컬스토리지 백업 시도
      if (combined.length === 0) {
        const savedData = localStorage.getItem('pubg-vehicles');
        if (savedData) combined = JSON.parse(savedData);
      }
      
      setVehicles(combined);
      setIsLoaded(true);
    };
    checkAdmin();
  }, [router]);

  useEffect(() => {
    if (isLoaded) localStorage.setItem('pubg-vehicles', JSON.stringify(vehicles));
  }, [vehicles, isLoaded]);

  const visibleVehicles = useMemo(() => {
    return vehicles.filter((v) => 
      (v.mapId === activeMapId || (!v.mapId && activeMapId === 'Erangel')) && filters[v.type]
    );
  }, [vehicles, activeMapId, filters]);

  const removeVehicle = (id: number) => setVehicles((prev) => prev.filter((v) => v.id !== id));
  
  const clearAllVehicles = () => {
    const currentMapCount = vehicles.filter(v => v.mapId === activeMapId || (!v.mapId && activeMapId === 'Erangel')).length;
    if (window.confirm(`⚠️ 현재 '${currentMap?.label}' 맵의 마커 ${currentMapCount}개를 모두 삭제하시겠습니까? (다른 맵의 마커는 유지됩니다)`)) {
      setVehicles((prev) => prev.filter(v => !(v.mapId === activeMapId || (!v.mapId && activeMapId === 'Erangel'))));
    }
  };

  const updateVehiclePos = (id: number, newY: number, newX: number) => {
    setVehicles((prev) => prev.map((v) => (v.id === id ? { ...v, y: newY, x: newX } : v)));
  };

  const toggleFilter = (type: string) => setFilters((prev) => ({ ...prev, [type]: !prev[type] }));
  const getCount = (type: string) => vehicles.filter(v => (v.mapId === activeMapId || (!v.mapId && activeMapId === 'Erangel')) && v.type === type).length;
  const totalCount = vehicles.filter(v => v.mapId === activeMapId || (!v.mapId && activeMapId === 'Erangel')).length;

  const handleSaveToDB = async () => {
    if(!confirm(`'${currentMap?.label}' 맵의 변경사항을 서버에 저장하시겠습니까?`)) return;
    setIsSaving(true);
    
    try {
      const { data: dbMarkers } = await supabase.from('map_markers').select('id').eq('map_id', activeMapId);
      const dbIds = dbMarkers?.map(m => m.id) || [];
      const currentMapVehicles = vehicles.filter(v => v.mapId === activeMapId || (!v.mapId && activeMapId === 'Erangel'));
      const currentIds = currentMapVehicles.map(v => v.id);
      const idsToDelete = dbIds.filter(id => !currentIds.includes(id));

      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase.from('map_markers').delete().in('id', idsToDelete);
        if (deleteError) throw deleteError;
      }
      
      const insertData = currentMapVehicles.map(v => ({
        id: Number(v.id), map_id: String(v.mapId || activeMapId), name: String(v.name || ''),
        type: String(v.type), x: Math.round(v.x), y: Math.round(v.y)
      }));
      
      if (insertData.length > 0) {
        const chunkSize = 500;
        for (let i = 0; i < insertData.length; i += chunkSize) {
          const chunk = insertData.slice(i, i + chunkSize);
          const { error: insertError } = await supabase.from('map_markers').upsert(chunk);
          if (insertError) throw insertError;
        }
      }
      alert(`🎉 '${currentMap?.label}' 맵의 마커 ${insertData.length}개가 저장되었습니다!`);
    } catch (error: any) {
      console.error('🚨 서버 저장 에러:', error);
      alert('저장 실패: ' + (error.message || '알 수 없는 오류 발생.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleMapClick = (e: L.LeafletMouseEvent) => {
    const newVehicle = {
      id: Date.now(),
      name: CATEGORY_INFO[activeType]?.label || '마커',
      x: e.latlng.lng,
      y: e.latlng.lat,
      mapId: activeMapId,
      type: activeType,
    };
    setVehicles((prev) => [...prev, newVehicle]);
  };

  if (!isAuthorized) return <div className="w-full h-screen bg-[#0f172a] flex items-center justify-center text-white font-bold">권한 확인 중...</div>;

  return (
    <div className="flex flex-col w-full h-screen bg-[#0f172a]">
      <header className="flex items-center justify-between h-[50px] px-4 bg-[#F2A900] border-b-2 border-[#cc8b00] z-[6000] shrink-0">
        <div className="flex items-center gap-4">
          <div className="text-xl font-black italic text-black select-none cursor-default">PUBG<span className="text-white">EDITOR</span></div>
          <nav className="flex gap-1">
            {MAP_LIST.map(m => (
              <button key={m.id} onClick={() => setActiveMapId(m.id)} className={`h-[30px] px-3 rounded font-bold text-xs transition-colors ${activeMapId === m.id ? 'bg-[#1a1a1a] text-white' : 'bg-transparent text-black hover:bg-black/10'}`}>
                {m.label}
              </button>
            ))}
          </nav>
        </div>
        <button onClick={() => router.push('/')} className="flex items-center gap-1 text-black hover:text-white px-3 py-1 transition-colors rounded hover:bg-black/20 font-bold text-xs" title="메인으로 나가기">🚪 나가기</button>
      </header>
      
      <div className="flex-1 relative w-full h-full overflow-hidden">
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] flex flex-wrap gap-2 bg-[#1e293b] border border-[#334155] p-3 rounded-xl shadow-2xl items-center justify-center max-w-[90vw]">
        
        {allowedCategories.map(id => {
          const info = CATEGORY_INFO[id];
          const isActive = activeType === id;
          const isFiltered = filters[id];
          return (
            <button key={id} onClick={() => { setActiveType(id); if (isActive) toggleFilter(id); }}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all border ${isFiltered ? '' : 'opacity-40 grayscale'} ${isActive ? 'ring-2 ring-offset-2 ring-offset-[#1e293b] ring-[#F2A900]' : ''}`}
              style={{ backgroundColor: isFiltered ? `${info.color}20` : '#334155', color: isFiltered ? info.color : '#94a3b8', borderColor: isFiltered ? info.color : '#475569' }}>
              {info.iconType} {info.label} ({getCount(id)})
            </button>
          )
        })}

        <div className="w-px h-6 bg-[#475569] mx-1"></div>

        <button onClick={clearAllVehicles} className="flex items-center gap-1 text-gray-400 hover:text-red-500 px-2 py-1 transition-colors rounded hover:bg-white/10" title="전체 삭제">
          🗑️ <span className="text-xs font-medium text-white">({totalCount})</span>
        </button>

        <button onClick={handleSaveToDB} disabled={isSaving} className={`flex items-center gap-1 px-3 py-1 transition-colors rounded font-bold text-xs ${isSaving ? 'bg-gray-600 text-gray-400' : 'bg-[#34A853] text-white hover:bg-[#2a9040]'}`} title="서버 DB에 즉시 반영">
          {isSaving ? '저장 중...' : '💾 서버에 저장'}
        </button>
      </div>

      <MapContainer center={[imageHeight / 2, imageWidth / 2]} zoom={-3} minZoom={-4} maxZoom={5} crs={CRS.Simple} style={{ height: '100%', width: '100%', background: 'transparent' }}>
        <ImageOverlay key={activeMapId} url={mapImageUrl} bounds={bounds} />
        <MapEvents onClick={handleMapClick} />
        {visibleVehicles.map((vehicle) => (
          <Marker
            key={vehicle.id} position={[vehicle.y, vehicle.x]} draggable={true}
            icon={icons[vehicle.type] || icons['Esports']}
            eventHandlers={{
              dragend: (e) => { const marker = e.target; const pos = marker.getLatLng(); updateVehiclePos(vehicle.id, pos.lat, pos.lng); },
              contextmenu: (e) => { e.originalEvent.preventDefault(); e.originalEvent.stopPropagation(); removeVehicle(vehicle.id); },
              click: (e) => { e.originalEvent.stopPropagation(); }
            }}
          />
        ))}
      </MapContainer>
      </div>
    </div>
  );
};

export default MapEditorComponent;