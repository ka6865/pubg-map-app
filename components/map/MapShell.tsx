import React, { memo, useState, useEffect } from "react";
import L from "leaflet";
import Sidebar from "../Sidebar";
import MapView from "./MapView";
import type { MapTab, MapMarker } from "../../types/map";

interface MapShellProps {
  activeMapId: string;
  currentMap: MapTab | undefined;
  bounds: [[number, number], [number, number]];
  visibleVehicles: MapMarker[];
  icons: Record<string, L.DivIcon>;
  imageHeight: number;
  imageWidth: number;
  isMobile: boolean;
  isSidebarOpen: boolean;
  filters: Record<string, boolean>;
  onCloseSidebar: () => void;
  onSetSidebarOpen: (isOpen: boolean) => void;
  onToggleFilter: (id: string) => void;
  onGetCount: (id: string) => number;
  onEnableDefaultVehicleFilters?: () => void;
}

const getDistanceToLineSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }

  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
};

const MapShell = memo(({
  activeMapId,
  currentMap,
  bounds,
  visibleVehicles,
  icons,
  imageHeight,
  imageWidth,
  isMobile,
  isSidebarOpen,
  filters,
  onCloseSidebar,
  onSetSidebarOpen,
  onToggleFilter,
  onGetCount,
  onEnableDefaultVehicleFilters,
}: MapShellProps) => {
  const [activeMode, setActiveMode] = useState<"none" | "mortar" | "flight">("none");
  const [mortarPoints, setMortarPoints] = useState<L.LatLng[]>([]);
  const [flightPoints, setFlightPoints] = useState<L.LatLng[]>([]);
  const [isVehicleFilterOn, setIsVehicleFilterOn] = useState(false);
  const [isGridOn, setIsGridOn] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    setActiveMode("none");
    setMortarPoints([]);
    setFlightPoints([]);
    setIsVehicleFilterOn(false);
    setIsMenuOpen(false);
  }, [activeMapId]);

  const mapScale = 8000 / imageWidth;
  const pxPerMeter = imageWidth / 8000;

  const handleModeToggle = (mode: "mortar" | "flight") => {
    setActiveMode(activeMode === mode ? "none" : mode);
    setMortarPoints([]);
    setFlightPoints([]);
    setIsVehicleFilterOn(false);
  };

  let flightPolygonCoords: [number, number][] = [];
  if (flightPoints.length === 2) {
    const p1 = flightPoints[0];
    const p2 = flightPoints[1];
    const radiusPx = 1000 * pxPerMeter;
    const dx = p2.lng - p1.lng;
    const dy = p2.lat - p1.lat;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len > 0) {
      const nx = -dy / len;
      const ny = dx / len;
      flightPolygonCoords = [
        [p1.lat + ny * radiusPx, p1.lng + nx * radiusPx],
        [p2.lat + ny * radiusPx, p2.lng + nx * radiusPx],
        [p2.lat - ny * radiusPx, p2.lng - nx * radiusPx],
        [p1.lat - ny * radiusPx, p1.lng - nx * radiusPx],
      ];
    }
  }

  let displayedVehicles = visibleVehicles;
  if (activeMode === "flight" && flightPoints.length === 2 && isVehicleFilterOn) {
    const p1 = flightPoints[0];
    const p2 = flightPoints[1];
    displayedVehicles = visibleVehicles.filter((v) => {
      const distPx = getDistanceToLineSegment(v.x, v.y, p1.lng, p1.lat, p2.lng, p2.lat);
      return distPx * mapScale <= 500;
    });
  }

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden" }}>
      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={onSetSidebarOpen}
        mapLabel={currentMap?.label || "지도"}
        activeMapId={activeMapId}
        filters={filters}
        toggleFilter={onToggleFilter}
        getCount={onGetCount}
      />

      <div style={{ flex: 1, position: "relative", height: "100%" }}>
        <div style={{ position: "absolute", top: "15px", right: "15px", zIndex: 1000, display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-end" }}>
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} style={{ padding: "10px 16px", backgroundColor: isMenuOpen ? "#d93025" : "#252525", color: "#fff", border: "1px solid #444", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 10px rgba(0,0,0,0.6)", transition: "all 0.2s ease-in-out" }}>
            {isMenuOpen ? "✖ 메뉴 닫기" : "🛠️ 지도 도구"}
          </button>

          {isMenuOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-end" }}>
              <button onClick={() => setIsGridOn(!isGridOn)} style={{ padding: "10px 16px", backgroundColor: isGridOn ? "#F2A900" : "#1a1a1a", color: isGridOn ? "#000" : "#aaa", border: "1px solid #333", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 10px rgba(0,0,0,0.5)" }}>
                🗺️ 그리드망 {isGridOn ? "ON" : "OFF"}
              </button>
              <button onClick={() => handleModeToggle("mortar")} style={{ padding: "10px 16px", backgroundColor: activeMode === "mortar" ? "#ea4335" : "#1a1a1a", color: activeMode === "mortar" ? "#fff" : "#aaa", border: "1px solid #333", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 10px rgba(0,0,0,0.5)" }}>
                🎯 박격포 계산기
              </button>
              <button onClick={() => handleModeToggle("flight")} style={{ padding: "10px 16px", backgroundColor: activeMode === "flight" ? "#3b82f6" : "#1a1a1a", color: activeMode === "flight" ? "#fff" : "#aaa", border: "1px solid #333", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 10px rgba(0,0,0,0.5)" }}>
                ✈️ 비행기 경로 (Drop Zone)
              </button>
              {activeMode === "flight" && flightPoints.length === 2 && (
                <button onClick={() => { const nextState = !isVehicleFilterOn; setIsVehicleFilterOn(nextState); if (nextState && onEnableDefaultVehicleFilters) onEnableDefaultVehicleFilters(); }} style={{ padding: "8px 12px", backgroundColor: isVehicleFilterOn ? "#F2A900" : "#252525", color: isVehicleFilterOn ? "#000" : "#888", border: "none", borderRadius: "20px", fontWeight: "900", fontSize: "12px", cursor: "pointer" }}>
                  🚗 주변 500m 탈것 찾기 {isVehicleFilterOn ? "ON" : "OFF"}
                </button>
              )}
            </div>
          )}
        </div>

        {activeMode !== "none" && (
          <div style={{ position: "absolute", top: "15px", left: "50%", transform: "translateX(-50%)", zIndex: 1000, backgroundColor: "rgba(0,0,0,0.7)", color: "white", padding: "8px 16px", borderRadius: "20px", fontSize: "13px", pointerEvents: "none", fontWeight: "bold", border: "1px solid #444" }}>
            {activeMode === "mortar" ? "📍 [박격포] 내 위치와 타겟을 클릭하세요" : "📍 [비행기] 출발지와 도착지를 클릭하세요"}
            <span style={{ color: "#F2A900", marginLeft: "10px" }}>(우클릭: 취소)</span>
          </div>
        )}

        <MapView
          activeMapId={activeMapId}
          currentMap={currentMap}
          bounds={bounds}
          icons={icons}
          imageHeight={imageHeight}
          imageWidth={imageWidth}
          activeMode={activeMode}
          mortarPoints={mortarPoints}
          flightPoints={flightPoints}
          flightPolygonCoords={flightPolygonCoords}
          displayedVehicles={displayedVehicles}
          isGridOn={isGridOn}
          mapScale={mapScale}
          setMortarPoints={setMortarPoints}
          setFlightPoints={setFlightPoints}
          setIsVehicleFilterOn={setIsVehicleFilterOn}
        />
      </div>
    </div>
  );
});

MapShell.displayName = "MapShell";
export default MapShell;
