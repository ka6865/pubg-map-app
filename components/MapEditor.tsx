'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { MapContainer, ImageOverlay, Marker, useMapEvents } from 'react-leaflet';
import L, { CRS } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';

const svgPaths = {
  car: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
  boat: "M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.39-.6-.39H2.72c-.26 0-.5.15-.6.39s-.14.52-.06.78L3.95 19z",
  glider: "M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z",
  key: "M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"
};

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

const garageIcon = createPinIcon('#dc2626', svgPaths.car);
const randomCarIcon = createPinIcon('#d97706', svgPaths.car);
const esportsIcon = createPinIcon('#7c3aed', svgPaths.car);
const boatIcon = createPinIcon('#2563eb', svgPaths.boat);
const esportsBoatIcon = createPinIcon('#7c3aed', svgPaths.boat);
const gliderIcon = createPinIcon('#ea580c', svgPaths.glider);
const keyIcon = createPinIcon('#16a34a', svgPaths.key);

const MAP_LIST = [
  { id: 'Erangel', label: '에란겔', imageUrl: '/Erangel.jpg' },
  { id: 'Miramar', label: '미라마', imageUrl: '/Miramar.jpg' },
  { id: 'Taego', label: '태이고', imageUrl: '/Taego.jpg' },
  { id: 'Rondo', label: '론도', imageUrl: '/Rondo.jpg' },
  { id: 'Vikendi', label: '비켄디', imageUrl: '/Vikendi.jpg' },
  { id: 'Deston', label: '데스턴', imageUrl: '/Deston.jpg' },
];

// 맵 클릭 이벤트 핸들러 컴포넌트
const MapEvents = ({ onClick }: { onClick: (e: L.LeafletMouseEvent) => void }) => {
  useMapEvents({ click: onClick });
  return null;
};

const MapEditorComponent = () => {
  const router = useRouter();
  // 권한 및 맵 상태
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [activeMapId, setActiveMapId] = useState('Erangel');
  const [isSaving, setIsSaving] = useState(false);
  
  const currentMap = MAP_LIST.find(m => m.id === activeMapId);
  const mapImageUrl = currentMap?.imageUrl || '/Erangel.jpg';

  const imageWidth = 8192;
  const imageHeight = 8192;
  const bounds: [[number, number], [number, number]] = [[0, 0], [imageHeight, imageWidth]];

  // 현재 선택된 마커 타입 및 필터 상태
  const [activeType, setActiveType] = useState<'Garage' | 'Random' | 'Esports' | 'Boat' | 'EsportsBoat' | 'Glider' | 'Key'>('Garage');
  
  const [filters, setFilters] = useState({
    Garage: true, Random: true, Esports: true, Boat: true, EsportsBoat: true, Glider: true, Key: true,
  });

  // 마커 데이터 상태
  const [isLoaded, setIsLoaded] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);

  // 관리자 권한 확인 및 초기 데이터 로드
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        alert('관리자 로그인이 필요합니다.');
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profile?.role !== 'admin') {
        alert('관리자 권한이 없습니다.');
        router.push('/');
        return;
      }

      setIsAuthorized(true);

      const { data } = await supabase.from('map_markers').select('*');
      if (data && data.length > 0) {
        setVehicles(data.map(v => ({ ...v, mapId: v.map_id })));
      } else {
        const savedData = localStorage.getItem('pubg-vehicles');
        if (savedData) {
          setVehicles(JSON.parse(savedData));
        }
      }
      setIsLoaded(true);
    };

    checkAdmin();
  }, [router]);

  // 로컬 스토리지에 작업 내용 자동 저장
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('pubg-vehicles', JSON.stringify(vehicles));
    }
  }, [vehicles, isLoaded]);

  // [최적화] 렌더링 시마다 실행되는 필터링 로직을 메모이제이션하여 성능 향상
  const visibleVehicles = useMemo(() => {
    return vehicles.filter((v) => 
      (v.mapId === activeMapId || (!v.mapId && activeMapId === 'Erangel')) && 
      filters[v.type as keyof typeof filters]
    );
  }, [vehicles, activeMapId, filters]);

  // 마커 삭제 함수
  const removeVehicle = (id: number) => {
    setVehicles((prev) => prev.filter((v) => v.id !== id));
  };

  // 현재 맵의 모든 마커 삭제 함수
  const clearAllVehicles = () => {
    const currentMapCount = vehicles.filter(v => v.mapId === activeMapId || (!v.mapId && activeMapId === 'Erangel')).length;
    if (window.confirm(`⚠️ 현재 '${currentMap?.label}' 맵의 마커 ${currentMapCount}개를 모두 삭제하시겠습니까? (다른 맵의 마커는 유지됩니다)`)) {
      setVehicles((prev) => prev.filter(v => !(v.mapId === activeMapId || (!v.mapId && activeMapId === 'Erangel'))));
    }
  };

  // 마커 위치 업데이트 함수 (드래그 종료 시)
  const updateVehiclePos = (id: number, newY: number, newX: number) => {
    setVehicles((prev) => 
      prev.map((v) => (v.id === id ? { ...v, y: newY, x: newX } : v))
    );
  };

  // 필터 토글 함수
  const toggleFilter = (type: 'Garage' | 'Random' | 'Esports' | 'Boat' | 'EsportsBoat' | 'Glider' | 'Key') => {
    setFilters((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  // 마커 개수 계산 함수
  const getCount = (type: string) => vehicles.filter(v => 
    (v.mapId === activeMapId || (!v.mapId && activeMapId === 'Erangel')) && 
    v.type === type
  ).length;
  
  const totalCount = vehicles.filter(v => 
    v.mapId === activeMapId || (!v.mapId && activeMapId === 'Erangel')
  ).length;

  // DB에 변경 사항 저장 함수
  const handleSaveToDB = async () => {
    if(!confirm(`'${currentMap?.label}' 맵의 변경사항을 서버에 저장하시겠습니까?`)) return;
    
    setIsSaving(true);
    
    try {
      // [최적화] 1. 현재 편집 중인 맵의 마커 ID만 가져옵니다. (전체 로드 방지)
      const { data: dbMarkers } = await supabase
        .from('map_markers')
        .select('id')
        .eq('map_id', activeMapId);
        
      const dbIds = dbMarkers?.map(m => m.id) || [];
      
      // 2. 현재 에디터 상태에서 해당 맵의 마커들만 추출
      const currentMapVehicles = vehicles.filter(v => v.mapId === activeMapId || (!v.mapId && activeMapId === 'Erangel'));
      const currentIds = currentMapVehicles.map(v => v.id);

      // 3. DB에는 있는데 에디터(현재 맵)에는 없는 ID = 삭제된 마커
      const idsToDelete = dbIds.filter(id => !currentIds.includes(id));

      // 4. 삭제된 마커들 DB에서 제거
      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase.from('map_markers').delete().in('id', idsToDelete);
        if (deleteError) throw deleteError;
      }
      
      // 5. 현재 맵의 마커들만 Upsert (변경된 내용 반영)
      const insertData = currentMapVehicles.map(v => ({
        id: Number(v.id),
        map_id: String(v.mapId || activeMapId),
        name: String(v.name || ''),
        type: String(v.type),
        x: Math.round(v.x),
        y: Math.round(v.y)
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

  // 맵 클릭 시 새 마커 추가 함수
  const handleMapClick = (e: L.LeafletMouseEvent) => {
    const newVehicle = {
      id: Date.now(),
      name: activeType === 'Garage' ? '차고지' 
          : activeType === 'Esports' ? '고정 차량' 
          : activeType === 'Random' ? '일반 차량' 
          : activeType === 'Glider' ? '글라이더'
          : activeType === 'Boat' ? '보트'
          : activeType === 'EsportsBoat' ? '고정 보트'
          : '비밀 열쇠',
      x: e.latlng.lng,
      y: e.latlng.lat,
      mapId: activeMapId,
      type: activeType,
    };
    setVehicles((prev) => [...prev, newVehicle]);
  };

  if (!isAuthorized) {
    return <div className="w-full h-screen bg-[#0f172a] flex items-center justify-center text-white font-bold">권한 확인 중...</div>;
  }

  return (
    <div className="flex flex-col w-full h-screen bg-[#0f172a]">
      <header className="flex items-center justify-between h-[50px] px-4 bg-[#F2A900] border-b-2 border-[#cc8b00] z-[6000] shrink-0">
        <div className="flex items-center gap-4">
          <div className="text-xl font-black italic text-black select-none cursor-default">
            PUBG<span className="text-white">EDITOR</span>
          </div>
          <nav className="flex gap-1">
            {MAP_LIST.map(m => (
              <button 
                key={m.id} 
                onClick={() => setActiveMapId(m.id)} 
                className={`h-[30px] px-3 rounded font-bold text-xs transition-colors ${activeMapId === m.id ? 'bg-[#1a1a1a] text-white' : 'bg-transparent text-black hover:bg-black/10'}`}
              >
                {m.label}
              </button>
            ))}
          </nav>
        </div>
        
        <button onClick={() => router.push('/')} className="flex items-center gap-1 text-black hover:text-white px-3 py-1 transition-colors rounded hover:bg-black/20 font-bold text-xs" title="메인으로 나가기">
          🚪 나가기
        </button>
      </header>
      
      <div className="flex-1 relative w-full h-full overflow-hidden">
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] flex flex-wrap gap-2 bg-white/95 p-3 rounded-xl shadow-2xl items-center justify-center max-w-[90vw]">
        
        <button onClick={() => { setActiveType('Garage'); if (activeType === 'Garage') toggleFilter('Garage'); }}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all border ${filters.Garage ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'} ${activeType === 'Garage' ? 'ring-2 ring-red-500 ring-offset-1' : ''}`}>
          🏠 차고 ({getCount('Garage')})
        </button>

        <button onClick={() => { setActiveType('Random'); if (activeType === 'Random') toggleFilter('Random'); }}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all border ${filters.Random ? 'bg-yellow-50 text-yellow-600 border-yellow-200' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'} ${activeType === 'Random' ? 'ring-2 ring-yellow-500 ring-offset-1' : ''}`}>
          🚕 랜덤 ({getCount('Random')})
        </button>

        <button onClick={() => { setActiveType('Esports'); if (activeType === 'Esports') toggleFilter('Esports'); }}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all border ${filters.Esports ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'} ${activeType === 'Esports' ? 'ring-2 ring-purple-500 ring-offset-1' : ''}`}>
          🏆 고정 ({getCount('Esports')})
        </button>

        <button onClick={() => { setActiveType('Glider'); if (activeType === 'Glider') toggleFilter('Glider'); }}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all border ${filters.Glider ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'} ${activeType === 'Glider' ? 'ring-2 ring-orange-500 ring-offset-1' : ''}`}>
          🪂 글라이더 ({getCount('Glider')})
        </button>

        <button onClick={() => { setActiveType('Boat'); if (activeType === 'Boat') toggleFilter('Boat'); }}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all border ${filters.Boat ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'} ${activeType === 'Boat' ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}>
          🚤 보트 ({getCount('Boat')})
        </button>

        <button onClick={() => { setActiveType('EsportsBoat'); if (activeType === 'EsportsBoat') toggleFilter('EsportsBoat'); }}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all border ${filters.EsportsBoat ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'} ${activeType === 'EsportsBoat' ? 'ring-2 ring-purple-500 ring-offset-1' : ''}`}>
          🏆 보트(E) ({getCount('EsportsBoat')})
        </button>

        <button onClick={() => { setActiveType('Key'); if (activeType === 'Key') toggleFilter('Key'); }}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all border ${filters.Key ? 'bg-green-50 text-green-600 border-green-200' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'} ${activeType === 'Key' ? 'ring-2 ring-green-500 ring-offset-1' : ''}`}>
          🔑 열쇠 ({getCount('Key')})
        </button>

        <div className="w-px h-6 bg-gray-300 mx-1"></div>

        <button onClick={clearAllVehicles} className="flex items-center gap-1 text-gray-400 hover:text-red-600 px-2 py-1 transition-colors rounded hover:bg-red-50" title="전체 삭제">
          🗑️ <span className="text-xs font-medium">({totalCount})</span>
        </button>

        <button onClick={handleSaveToDB} disabled={isSaving} className={`flex items-center gap-1 px-3 py-1 transition-colors rounded font-bold text-xs ${isSaving ? 'bg-gray-300 text-gray-500' : 'bg-[#34A853] text-white hover:bg-[#2a9040]'}`} title="서버 DB에 즉시 반영">
          {isSaving ? '저장 중...' : '💾 서버에 저장'}
        </button>
      </div>

      <MapContainer 
        center={[imageHeight / 2, imageWidth / 2]} 
        zoom={-3} 
        minZoom={-4} 
        maxZoom={5} 
        crs={CRS.Simple} 
        style={{ height: '100%', width: '100%', background: 'transparent' }}
      >
        <ImageOverlay key={activeMapId} url={mapImageUrl} bounds={bounds} />
        
        <MapEvents onClick={handleMapClick} />

        {visibleVehicles.map((vehicle) => (
          <Marker
            key={vehicle.id}
            position={[vehicle.y, vehicle.x]}
            draggable={true}
            icon={
              vehicle.type === 'Garage' ? garageIcon 
              : vehicle.type === 'Random' ? randomCarIcon
              : vehicle.type === 'Esports' ? esportsIcon
              : vehicle.type === 'Glider' ? gliderIcon
              : vehicle.type === 'Boat' ? boatIcon
              : vehicle.type === 'EsportsBoat' ? esportsBoatIcon
              : keyIcon
            }
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target;
                const position = marker.getLatLng();
                updateVehiclePos(vehicle.id, position.lat, position.lng);
              },
              contextmenu: (e) => {
                e.originalEvent.preventDefault();
                e.originalEvent.stopPropagation();
                removeVehicle(vehicle.id);
              },
              click: (e) => {
                 e.originalEvent.stopPropagation(); 
              }
            }}
          />
        ))}

      </MapContainer>
      </div>
    </div>
  );
};

export default MapEditorComponent;