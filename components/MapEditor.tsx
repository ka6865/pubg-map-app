'use client';

import { useState, useEffect } from 'react';
import { MapContainer, ImageOverlay, Marker, useMapEvents } from 'react-leaflet';
import L, { CRS } from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- [1. 아이콘 디자인 설정 (사이즈 조정됨: 24x32)] ---

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


const Map = () => {
  const mapImageUrl = '/Erangel.png';
  const imageWidth = 8192;
  const imageHeight = 8192;
  const bounds: [[number, number], [number, number]] = [[0, 0], [imageHeight, imageWidth]];

  const [activeType, setActiveType] = useState<'Garage' | 'Random' | 'Esports' | 'Boat' | 'EsportsBoat' | 'Glider' | 'Key'>('Garage');
  
  const [filters, setFilters] = useState({
    Garage: true, Random: true, Esports: true, Boat: true, EsportsBoat: true, Glider: true, Key: true,
  });

  const [isLoaded, setIsLoaded] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);

  useEffect(() => {
    const savedData = localStorage.getItem('pubg-vehicles');
    if (savedData) {
      setVehicles(JSON.parse(savedData));
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('pubg-vehicles', JSON.stringify(vehicles));
    }
  }, [vehicles, isLoaded]);

  const removeVehicle = (id: number) => {
    setVehicles((prev) => prev.filter((v) => v.id !== id));
  };

  const clearAllVehicles = () => {
    if (window.confirm(`⚠️ 현재 찍힌 마커 ${vehicles.length}개를 모두 삭제하시겠습니까? (복구 불가)`)) {
      setVehicles([]);
    }
  };

  const updateVehiclePos = (id: number, newY: number, newX: number) => {
    setVehicles((prev) => 
      prev.map((v) => (v.id === id ? { ...v, y: newY, x: newX } : v))
    );
  };

  const toggleFilter = (type: 'Garage' | 'Random' | 'Esports' | 'Boat' | 'EsportsBoat' | 'Glider' | 'Key') => {
    setFilters((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  // 🔢 [NEW] 개수 세기 도우미 함수
  const getCount = (type: string) => vehicles.filter(v => v.type === type).length;
  // 전체 개수
  const totalCount = vehicles.length;

  const MapClickHandler = () => {
    useMapEvents({
      click(e) {
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
          type: activeType,
        };
        setVehicles((prev) => [...prev, newVehicle]);
      },
    });
    return null;
  };

  return (
    <div className="w-full h-screen bg-[#0f172a] relative">
      
      {/* --- [상단 컨트롤 패널 (카운트 기능 추가)] --- */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] flex flex-wrap gap-2 bg-white/95 p-3 rounded-xl shadow-2xl items-center justify-center max-w-[90vw]">
        
        {/* 🏠 차고 */}
        <button onClick={() => { setActiveType('Garage'); if (activeType === 'Garage') toggleFilter('Garage'); }}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all border ${filters.Garage ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'} ${activeType === 'Garage' ? 'ring-2 ring-red-500 ring-offset-1' : ''}`}>
          🏠 차고 ({getCount('Garage')})
        </button>

        {/* 🚕 랜덤 */}
        <button onClick={() => { setActiveType('Random'); if (activeType === 'Random') toggleFilter('Random'); }}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all border ${filters.Random ? 'bg-yellow-50 text-yellow-600 border-yellow-200' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'} ${activeType === 'Random' ? 'ring-2 ring-yellow-500 ring-offset-1' : ''}`}>
          🚕 랜덤 ({getCount('Random')})
        </button>

        {/* 🏆 고정 차 */}
        <button onClick={() => { setActiveType('Esports'); if (activeType === 'Esports') toggleFilter('Esports'); }}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all border ${filters.Esports ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'} ${activeType === 'Esports' ? 'ring-2 ring-purple-500 ring-offset-1' : ''}`}>
          🏆 고정 ({getCount('Esports')})
        </button>

        {/* 🪂 글라이더 */}
        <button onClick={() => { setActiveType('Glider'); if (activeType === 'Glider') toggleFilter('Glider'); }}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all border ${filters.Glider ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'} ${activeType === 'Glider' ? 'ring-2 ring-orange-500 ring-offset-1' : ''}`}>
          🪂 글라이더 ({getCount('Glider')})
        </button>

        {/* 🚤 보트 (랜덤) */}
        <button onClick={() => { setActiveType('Boat'); if (activeType === 'Boat') toggleFilter('Boat'); }}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all border ${filters.Boat ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'} ${activeType === 'Boat' ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}>
          🚤 보트 ({getCount('Boat')})
        </button>

        {/* 🛥️ 고정 보트 */}
        <button onClick={() => { setActiveType('EsportsBoat'); if (activeType === 'EsportsBoat') toggleFilter('EsportsBoat'); }}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all border ${filters.EsportsBoat ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'} ${activeType === 'EsportsBoat' ? 'ring-2 ring-purple-500 ring-offset-1' : ''}`}>
          🏆 보트(E) ({getCount('EsportsBoat')})
        </button>

        {/* 🔑 열쇠 */}
        <button onClick={() => { setActiveType('Key'); if (activeType === 'Key') toggleFilter('Key'); }}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all border ${filters.Key ? 'bg-green-50 text-green-600 border-green-200' : 'bg-gray-50 text-gray-400 border-gray-100 opacity-60'} ${activeType === 'Key' ? 'ring-2 ring-green-500 ring-offset-1' : ''}`}>
          🔑 열쇠 ({getCount('Key')})
        </button>

        <div className="w-px h-6 bg-gray-300 mx-1"></div>

        {/* 전체 삭제 및 총 개수 */}
        <button onClick={clearAllVehicles} className="flex items-center gap-1 text-gray-400 hover:text-red-600 px-2 py-1 transition-colors rounded hover:bg-red-50" title="전체 삭제">
          🗑️ <span className="text-xs font-medium">({totalCount})</span>
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
        <ImageOverlay url={mapImageUrl} bounds={bounds} />
        
        <MapClickHandler />

        {vehicles
          .filter((v) => filters[v.type as 'Garage' | 'Random' | 'Esports' | 'Boat' | 'EsportsBoat' | 'Glider' | 'Key'])
          .map((vehicle) => (
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
  );
};

export default Map;