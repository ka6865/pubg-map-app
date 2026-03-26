import React, { memo } from "react";
import {
  MapContainer,
  ImageOverlay,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Polygon,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import L, { CRS } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapTab, MapMarker } from "../../types/map";

// --- 상수 및 아이콘 정의 ---
const mortarStartIcon = L.divIcon({
  className: "custom-mortar",
  html: `<div style="width:14px;height:14px;background:#34A853;border:2px solid white;border-radius:50%;"></div>`,
  iconSize: [14, 14],
});

const mortarEndIcon = L.divIcon({
  className: "custom-mortar",
  html: `<div style="width:14px;height:14px;background:#ea4335;border:2px solid white;border-radius:50%;"></div>`,
  iconSize: [14, 14],
});

const emptyIcon = L.divIcon({
  className: "empty-icon",
  html: "",
  iconSize: [0, 0],
});

const flightPointIcon = L.divIcon({
  className: "flight-point",
  html: `<div style="width:16px;height:16px;background:#3b82f6;border:2px solid white;border-radius:50%;"></div>`,
  iconSize: [16, 16],
});

// --- 그리드망 컴포넌트 ---
const PUBGGrid = memo(() => {
  const lines = [];
  const size = 8192;
  const pxPer100m = 102.4;

  for (let i = 0; i <= 80; i++) {
    const pos = i * pxPer100m;
    const isMajor = i % 10 === 0;
    const color = isMajor ? "#F2A900" : "#ffffff";
    const weight = isMajor ? 2 : 1;
    const opacity = isMajor ? 0.4 : 0.1;

    lines.push(
      <Polyline
        key={`h-${i}`}
        positions={[
          [pos, 0],
          [pos, size],
        ]}
        color={color}
        weight={weight}
        opacity={opacity}
        interactive={false}
      />
    );
    lines.push(
      <Polyline
        key={`v-${i}`}
        positions={[
          [0, pos],
          [size, pos],
        ]}
        color={color}
        weight={weight}
        opacity={opacity}
        interactive={false}
      />
    );
  }
  return <>{lines}</>;
});
PUBGGrid.displayName = "PUBGGrid";

// --- 인터랙션 핸들러 ---
interface MapInteractionProps {
  activeMode: "none" | "mortar" | "flight";
  setMortarPoints: React.Dispatch<React.SetStateAction<L.LatLng[]>>;
  setFlightPoints: React.Dispatch<React.SetStateAction<L.LatLng[]>>;
  setIsVehicleFilterOn: React.Dispatch<React.SetStateAction<boolean>>;
}

const MapInteraction = ({
  activeMode,
  setMortarPoints,
  setFlightPoints,
  setIsVehicleFilterOn,
}: MapInteractionProps) => {
  useMapEvents({
    click(e) {
      if (activeMode === "mortar") {
        setMortarPoints((prev) =>
          prev.length >= 2 ? [e.latlng] : [...prev, e.latlng]
        );
      } else if (activeMode === "flight") {
        setFlightPoints((prev) => {
          if (prev.length >= 2) {
            setIsVehicleFilterOn(false);
            return [e.latlng];
          }
          return [...prev, e.latlng];
        });
      }
    },
    contextmenu(e) {
      e.originalEvent.preventDefault();
      if (activeMode === "mortar") setMortarPoints([]);
      if (activeMode === "flight") {
        setFlightPoints([]);
        setIsVehicleFilterOn(false);
      }
    },
  });
  return null;
};

// --- 메인 MapView 컴포넌트 Props ---
interface MapViewProps {
  activeMapId: string;
  currentMap: MapTab | undefined;
  bounds: [[number, number], [number, number]];
  icons: Record<string, L.DivIcon>;
  imageHeight: number;
  imageWidth: number;
  activeMode: "none" | "mortar" | "flight";
  mortarPoints: L.LatLng[];
  flightPoints: L.LatLng[];
  flightPolygonCoords: [number, number][];
  displayedVehicles: MapMarker[];
  isGridOn: boolean;
  mapScale: number;
  setMortarPoints: React.Dispatch<React.SetStateAction<L.LatLng[]>>;
  setFlightPoints: React.Dispatch<React.SetStateAction<L.LatLng[]>>;
  setIsVehicleFilterOn: React.Dispatch<React.SetStateAction<boolean>>;
}

const MapView = memo(
  ({
    activeMapId,
    currentMap,
    bounds,
    icons,
    imageHeight,
    imageWidth,
    activeMode,
    mortarPoints,
    flightPoints,
    flightPolygonCoords,
    displayedVehicles,
    isGridOn,
    mapScale,
    setMortarPoints,
    setFlightPoints,
    setIsVehicleFilterOn,
  }: MapViewProps) => {
    return (
      <MapContainer
        key={activeMapId}
        center={[imageHeight / 2, imageWidth / 2]}
        zoom={-3}
        minZoom={-4}
        maxZoom={2}
        crs={CRS.Simple}
        maxBounds={bounds}
        maxBoundsViscosity={1.0}
        style={{ height: "100%", width: "100%", background: "#0b0f19" }}
        zoomControl={false}
      >
        {currentMap &&
          (activeMapId === "Erangel" ? (
            <TileLayer
              url={`/tiles/Erangel/{z}/{x}/{y}.jpg`}
              minZoom={-4}
              maxZoom={2}
              maxNativeZoom={0} // 🌟 돋보기 효과: 줌을 끝까지 땡겨도 404 에러 안 나게 방어
              zoomOffset={5} // 🌟 줌 레벨 스케일 보정
              bounds={bounds}
              noWrap={true}
            />
          ) : (
            <ImageOverlay url={currentMap.imageUrl} bounds={bounds} />
          ))}

        {isGridOn && <PUBGGrid />}

        <MapInteraction
          activeMode={activeMode}
          setMortarPoints={setMortarPoints}
          setFlightPoints={setFlightPoints}
          setIsVehicleFilterOn={setIsVehicleFilterOn}
        />

        {displayedVehicles.map((v) => (
          <Marker
            key={v.id}
            position={[v.y, v.x]}
            icon={icons[v.type] || icons["Esports"]}
          >
            <Popup>{v.name}</Popup>
          </Marker>
        ))}

        {activeMode === "mortar" && mortarPoints.length > 0 && (
          <>
            {mortarPoints.map((p, i) => (
              <Marker
                key={i}
                position={p}
                icon={i === 0 ? mortarStartIcon : mortarEndIcon}
              />
            ))}
            {mortarPoints.length === 2 && (
              <>
                <Polyline
                  positions={mortarPoints.map((p) => [p.lat, p.lng])}
                  color="#ea4335"
                  weight={3}
                  dashArray="8, 8"
                  interactive={false}
                />
                <Marker
                  position={[
                    (mortarPoints[0].lat + mortarPoints[1].lat) / 2,
                    (mortarPoints[0].lng + mortarPoints[1].lng) / 2,
                  ]}
                  icon={emptyIcon}
                  interactive={false}
                >
                  <Tooltip permanent direction="center" opacity={0.95}>
                    <div
                      style={{
                        textAlign: "center",
                        padding: "4px",
                        fontWeight: "bold",
                      }}
                    >
                      <div style={{ fontSize: "16px", color: "#d93025" }}>
                        거리:{" "}
                        {Math.round(
                          Math.sqrt(
                            Math.pow(
                              mortarPoints[0].lat - mortarPoints[1].lat,
                              2
                            ) +
                              Math.pow(
                                mortarPoints[0].lng - mortarPoints[1].lng,
                                2
                              )
                          ) * mapScale
                        )}
                        m
                      </div>
                    </div>
                  </Tooltip>
                </Marker>
              </>
            )}
          </>
        )}

        {activeMode === "flight" && flightPoints.length > 0 && (
          <>
            {flightPoints.map((p, i) => (
              <Marker key={i} position={p} icon={flightPointIcon} />
            ))}
            {flightPoints.length === 2 && flightPolygonCoords.length > 0 && (
              <>
                <Polygon
                  positions={flightPolygonCoords}
                  color="#3b82f6"
                  fillColor="#3b82f6"
                  fillOpacity={0.15}
                  weight={1}
                  interactive={false}
                />
                <Polyline
                  positions={flightPoints.map((p) => [p.lat, p.lng])}
                  color="#ffffff"
                  weight={4}
                  dashArray="10, 10"
                  interactive={false}
                />
              </>
            )}
          </>
        )}
      </MapContainer>
    );
  }
);

MapView.displayName = "MapView";
export default MapView;
