'use client';

import { useState, useEffect } from 'react'; // 1. useEffect 추가
import { MapContainer, ImageOverlay, Marker, useMapEvents } from 'react-leaflet';
import L, { CRS } from 'leaflet'; 
import 'leaflet/dist/leaflet.css';

// --- [아이콘 설정] ---
const carIcon = L.icon({
  iconUrl: '/car.png',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const boatIcon = L.icon({
  iconUrl: '/boat.png',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const Map = () => {
  const mapImageUrl = '/Erangel.png'; 
  const imageWidth = 8192; 
  const imageHeight = 8192;
  const bounds: [[number, number], [number, number]] = [[0, 0], [imageHeight, imageWidth]];

  const [activeType, setActiveType] = useState<'Car' | 'Boat'>('Car');
  
  // 2. 초기 로딩 상태 (처음엔 데이터를 아직 안 불러왔으니 false)
  const [isLoaded, setIsLoaded] = useState(false);

  const [vehicles, setVehicles] = useState([
    { id: 1, name: '중앙 차고지', x: 4096, y: 4096, type: 'Car' },    
  ]);

  // 3. 📤 [불러오기] 사이트 켜지자마자 딱 한 번 실행!
  useEffect(() => {
    const savedData = localStorage.getItem('pubg-vehicles'); // 창고 뒤지기
    if (savedData) {
      // 저장된 게 있으면 그걸로 덮어쓰기
      setVehicles(JSON.parse(savedData));
    }
    setIsLoaded(true); // "로딩 끝났다!"고 표시
  }, []);

  // 4. 📥 [저장하기] vehicles 데이터가 바뀔 때마다 실행!
  useEffect(() => {
    // 로딩이 다 끝난 상태일 때만 저장해야 함 (안 그러면 빈 데이터로 덮어씌워짐)
    if (isLoaded) {
      localStorage.setItem('pubg-vehicles', JSON.stringify(vehicles));
    }
  }, [vehicles, isLoaded]); // vehicles나 isLoaded가 변하면 작동

  const removeVehicle = (id: number) => {
    setVehicles((prev) => prev.filter((v) => v.id !== id));
  };

  const clearAllvehicle = () => {
    if(window.confirm('정말 모든 마크를 지우시겠습니까?'))
        setVehicles([])
  }
  const MapClickHandler = () => {
    useMapEvents({
      click(e) {
        const newVehicle = {
          id: Date.now(),
          name: activeType === 'Car' ? '차량 스폰' : '보트 스폰',
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
      
      {/* 상단 버튼 */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] flex gap-2 bg-white/90 p-2 rounded-lg shadow-lg">
        <button
          onClick={() => setActiveType('Car')}
          className={`px-4 py-2 rounded font-bold transition-colors ${
            activeType === 'Car' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          🚗 자동차
        </button>
        <button
          onClick={() => setActiveType('Boat')}
          className={`px-4 py-2 rounded font-bold transition-colors ${
            activeType === 'Boat' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          🚤 보트
        </button>
        <button
            onClick={clearAllvehicle}
            className="px-4 py-2 rounded font-bold bg-white text-red-600 border-2 border-red-600 hover:bg-red-50 transition-colors ml-4"
        >
            🗑️ 초기화
        </button>
        
        
      </div>

      <MapContainer 
        center={[imageHeight / 2, imageWidth / 2]} 
        zoom={-3} 
        minZoom={-4} 
        maxZoom={2}
        crs={CRS.Simple} 
        style={{ height: '100%', width: '100%', background: 'transparent' }}
      >
        <ImageOverlay url={mapImageUrl} bounds={bounds} />
        
        <MapClickHandler />

        {vehicles.map((vehicle) => (
          <Marker
            key={vehicle.id}
            position={[vehicle.y, vehicle.x]} 
            icon={vehicle.type === 'Boat' ? boatIcon : carIcon}
            eventHandlers={{
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