'use client';

import { MapContainer, ImageOverlay, CircleMarker, Popup } from 'react-leaflet';
import { CRS } from 'leaflet'; 
import 'leaflet/dist/leaflet.css';

const Map = () => {
  const mapImageUrl = '/Erangel.png'; 
  const imageWidth = 8192; 
  const imageHeight = 8192;
  const bounds: [[number, number], [number, number]] = [[0, 0], [imageHeight, imageWidth]];

  // ▼ [중요] 변수 선언은 여기(return 위)에 있어야 합니다! ▼
  const vehicles = [
    { id: 1, name: '중앙 차고지', x: 4096, y: 4096, type: 'Car' },    
    { id: 2, name: '11시 방향 정찰', x: 2000, y: 6000, type: 'Car' }, 
    { id: 3, name: '5시 방향 보트', x: 6000, y: 2000, type: 'Boat' }, 
  ];
  // ▲ 여기까지 ▲

  return (
    <div className="w-full h-screen bg-[#0f172a]">
      <MapContainer 
        center={[imageHeight / 2, imageWidth / 2]} 
        zoom={-3} 
        minZoom={-4} 
        maxZoom={2}
        crs={CRS.Simple} 
        style={{ height: '100%', width: '100%', background: 'transparent' }}
      >
        <ImageOverlay
          url={mapImageUrl}
          bounds={bounds}
        />

        {/* 지도 위에 점 찍기 */}
        {vehicles.map((vehicle) => (
          <CircleMarker
            key={vehicle.id}
            center={[vehicle.y, vehicle.x]} 
            radius={10} 
            pathOptions={{ color: 'red', fillColor: '#f87171', fillOpacity: 1 }}
          >
            <Popup>
              <div className="text-black font-bold">
                🚗 {vehicle.name}<br/>
                좌표: {vehicle.x}, {vehicle.y}
              </div>
            </Popup>
          </CircleMarker>
        ))}

      </MapContainer>
    </div>
  );
};

export default Map;