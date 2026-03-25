import React, { memo, useState, useEffect } from "react";
import {
  MapContainer,
  ImageOverlay,
  Marker,
  Popup,
  Polyline,
  Polygon,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import L, { CRS } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapViewProps } from "../../types/map";

interface ExtendedMapViewProps extends MapViewProps {
  onEnableDefaultVehicleFilters?: () => void;
}

// 🧮 [유틸 함수] 점(마커)과 선(비행기 경로) 사이의 수직 거리(px)를 구하는 공식
const getDistanceToLineSegment = (
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) => {
  // 1. 선분의 시작점(x1, y1)을 원점(0,0)으로 보았을 때, 타겟 점(px, py)의 상대 좌표 (벡터 P)
  const A = px - x1;
  const B = py - y1;
  // 2. 선분의 시작점(x1, y1)에서 끝점(x2, y2)으로 향하는 선분의 방향과 길이 (벡터 L)
  const C = x2 - x1;
  const D = y2 - y1;

  // 3. 내적(Dot Product)을 통해 점이 선분 상의 어느 위치에 투영(수선의 발)되는지 비율(param)을 계산
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) param = dot / lenSq; // param이 0~1 사이면 수선의 발이 선분 구간 내부에 떨어짐

  let xx, yy;
  if (param < 0) {
    // 투영된 위치가 시작점보다 뒤쪽일 때 -> 선분에서 가장 가까운 위치는 '시작점'
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    // 투영된 위치가 끝점보다 앞쪽일 때 -> 선분에서 가장 가까운 위치는 '끝점'
    xx = x2;
    yy = y2;
  } else {
    // 점의 수선의 발이 선분 내부에 떨어질 때 -> 선분 위의 수직 교차점을 가장 가까운 점으로 지정
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  // 4. 타겟 점(px, py)과 선분 상의 가장 가까운 점(xx, yy) 사이의 거리를 피타고라스 정리로 계산
  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
};

// 🌟 [최적화] 렌더링 시 매번 생성되지 않도록 컴포넌트 외부로 아이콘 객체 분리
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

interface MapInteractionProps {
  activeMode: "none" | "mortar" | "flight";
  setMortarPoints: React.Dispatch<React.SetStateAction<L.LatLng[]>>;
  setFlightPoints: React.Dispatch<React.SetStateAction<L.LatLng[]>>;
  setIsVehicleFilterOn: React.Dispatch<React.SetStateAction<boolean>>;
}

// 🌟 지도 클릭 이벤트를 감지하고 모드에 따라 점을 찍어주는 핸들러
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
        setFlightPoints((prev) =>
          prev.length >= 2 ? [e.latlng] : [...prev, e.latlng]
        );
      }
    },
    contextmenu(e) {
      e.originalEvent.preventDefault();
      if (activeMode === "mortar") setMortarPoints([]);
      if (activeMode === "flight") {
        setFlightPoints([]);
        setIsVehicleFilterOn(false); // 경로가 사라지면 차량 필터도 함께 초기화
      }
    },
  });
  return null;
};

// 🌟 메인 MapView 컴포넌트
const MapView = memo(
  ({
    activeMapId,
    currentMap,
    bounds,
    visibleVehicles,
    icons,
    imageHeight,
    imageWidth,
    onEnableDefaultVehicleFilters,
  }: ExtendedMapViewProps) => {
    // 상태 관리 (도구 모드 및 클릭한 좌표들)
    const [activeMode, setActiveMode] = useState<"none" | "mortar" | "flight">(
      "none"
    );
    const [mortarPoints, setMortarPoints] = useState<L.LatLng[]>([]);
    const [flightPoints, setFlightPoints] = useState<L.LatLng[]>([]);
    const [isVehicleFilterOn, setIsVehicleFilterOn] = useState(false); // 경로 주변 차량 필터 토글

    // 맵이 바뀔 때마다 도구 초기화
    useEffect(() => {
      setActiveMode("none");
      setMortarPoints([]);
      setFlightPoints([]);
      setIsVehicleFilterOn(false);
    }, [activeMapId]);

    // 비율 계산 (8000m 맵 기준)
    const mapScale = 8000 / imageWidth; // 1픽셀당 미터(m)
    const pxPerMeter = imageWidth / 8000; // 1미터당 픽셀(px)

    // 모드 토글 핸들러 (전환 시 잔여 상태를 깔끔하게 초기화)
    const handleModeToggle = (mode: "mortar" | "flight") => {
      setActiveMode(activeMode === mode ? "none" : mode);
      // 다른 모드로 갈 때마다 점들과 필터 상태를 초기화
      setMortarPoints([]);
      setFlightPoints([]);
      setIsVehicleFilterOn(false);
    };

    // ✈️ 비행기 1km 낙하 반경(Polygon) 계산 로직
    let flightPolygonCoords: [number, number][] = [];
    if (flightPoints.length === 2) {
      const p1 = flightPoints[0];
      const p2 = flightPoints[1];
      const radiusPx = 1000 * pxPerMeter; // 1000m(1km)를 픽셀로 변환

      // 비행기 선분의 방향(법선 벡터) 구하기
      const dx = p2.lng - p1.lng;
      const dy = p2.lat - p1.lat;
      const len = Math.sqrt(dx * dx + dy * dy);

      // 🌟 [추가된 방어 코드] 거리가 0보다 클 때(서로 다른 두 점일 때)만 계산!
      if (len > 0) {
        const nx = -dy / len; // 수직 X 벡터
        const ny = dx / len; // 수직 Y 벡터

        // 선분 양옆으로 1km 떨어진 4개의 모서리 점을 구해서 직사각형(다각형) 생성
        flightPolygonCoords = [
          [p1.lat + ny * radiusPx, p1.lng + nx * radiusPx], // 시작점 왼쪽
          [p2.lat + ny * radiusPx, p2.lng + nx * radiusPx], // 끝점 왼쪽
          [p2.lat - ny * radiusPx, p2.lng - nx * radiusPx], // 끝점 오른쪽
          [p1.lat - ny * radiusPx, p1.lng - nx * radiusPx], // 시작점 오른쪽
        ];
      }
    }

    // 🚗 경로 주변 500m 차량만 남기기 (동적 마커 필터링)
    let displayedVehicles = visibleVehicles;
    if (
      activeMode === "flight" &&
      flightPoints.length === 2 &&
      isVehicleFilterOn
    ) {
      const p1 = flightPoints[0];
      const p2 = flightPoints[1];

      displayedVehicles = visibleVehicles.filter((v) => {
        // 각 마커와 비행기 선분 사이의 픽셀 거리 계산
        const distPx = getDistanceToLineSegment(
          v.x,
          v.y,
          p1.lng,
          p1.lat,
          p2.lng,
          p2.lat
        );
        const distM = distPx * mapScale; // 미터로 변환
        return distM <= 500; // 🌟 500m 이내인 것만 통과!
      });
    }

    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {/* 🌟 도구 상자 UI (우측 상단 플로팅) */}
        <div
          style={{
            position: "absolute",
            top: "15px",
            right: "15px",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            alignItems: "flex-end",
          }}
        >
          {/* 박격포 버튼 */}
          <button
            onClick={() => handleModeToggle("mortar")}
            style={{
              padding: "10px 16px",
              backgroundColor: activeMode === "mortar" ? "#ea4335" : "#1a1a1a",
              color: activeMode === "mortar" ? "#fff" : "#aaa",
              border: "1px solid #333",
              borderRadius: "8px",
              fontWeight: "bold",
              cursor: "pointer",
              boxShadow: "0 4px 10px rgba(0,0,0,0.5)",
            }}
          >
            🎯 박격포 계산기
          </button>

          {/* 비행기 경로 버튼 */}
          <button
            onClick={() => handleModeToggle("flight")}
            style={{
              padding: "10px 16px",
              backgroundColor: activeMode === "flight" ? "#3b82f6" : "#1a1a1a",
              color: activeMode === "flight" ? "#fff" : "#aaa",
              border: "1px solid #333",
              borderRadius: "8px",
              fontWeight: "bold",
              cursor: "pointer",
              boxShadow: "0 4px 10px rgba(0,0,0,0.5)",
            }}
          >
            ✈️ 비행기 경로 (Drop Zone)
          </button>

          {/* 차량 500m 필터 토글 (비행기 모드이고 선이 그어졌을 때만 노출) */}
          {activeMode === "flight" && flightPoints.length === 2 && (
            <button
              onClick={() => {
                const nextState = !isVehicleFilterOn;
                setIsVehicleFilterOn(nextState);
                if (nextState && onEnableDefaultVehicleFilters) {
                  onEnableDefaultVehicleFilters();
                }
              }}
              style={{
                padding: "8px 12px",
                backgroundColor: isVehicleFilterOn ? "#F2A900" : "#252525",
                color: isVehicleFilterOn ? "#000" : "#888",
                border: "none",
                borderRadius: "20px",
                fontWeight: "900",
                fontSize: "12px",
                cursor: "pointer",
                animation: "fadeIn 0.2s",
              }}
            >
              🚗 주변 500m 탈것 찾기 {isVehicleFilterOn ? "ON" : "OFF"}
            </button>
          )}
        </div>

        {/* 안내 메시지 */}
        {activeMode !== "none" && (
          <div
            style={{
              position: "absolute",
              top: "15px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 1000,
              backgroundColor: "rgba(0,0,0,0.7)",
              color: "white",
              padding: "8px 16px",
              borderRadius: "20px",
              fontSize: "13px",
              pointerEvents: "none",
              fontWeight: "bold",
              border: "1px solid #444",
            }}
          >
            {activeMode === "mortar"
              ? "📍 [박격포] 내 위치와 타겟을 클릭하세요"
              : "📍 [비행기] 출발지와 도착지를 클릭하세요"}
            <span style={{ color: "#F2A900", marginLeft: "10px" }}>
              (우클릭: 취소)
            </span>
          </div>
        )}

        <MapContainer
          key={activeMapId}
          center={[imageHeight / 2, imageWidth / 2]}
          zoom={-3}
          minZoom={-4}
          maxZoom={2}
          crs={CRS.Simple}
          style={{ height: "100%", width: "100%", background: "#0b0f19" }}
          zoomControl={false}
        >
          {currentMap && (
            <ImageOverlay url={currentMap.imageUrl} bounds={bounds} />
          )}
          <MapInteraction
            activeMode={activeMode}
            setMortarPoints={setMortarPoints}
            setFlightPoints={setFlightPoints}
            setIsVehicleFilterOn={setIsVehicleFilterOn}
          />

          {/* 🌟 필터링이 적용된 마커 렌더링 */}
          {displayedVehicles.map((v) => (
            <Marker
              key={v.id}
              position={[v.y, v.x]}
              icon={icons[v.type] || icons["Esports"]}
            >
              <Popup>{v.name}</Popup>
            </Marker>
          ))}

          {/* 🎯 박격포 렌더링 */}
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

          {/* ✈️ 비행기 경로 렌더링 */}
          {activeMode === "flight" && flightPoints.length > 0 && (
            <>
              {/* 비행기 경로 점 (출발/도착) */}
              {flightPoints.map((p, i) => (
                <Marker key={i} position={p} icon={flightPointIcon} />
              ))}

              {/* 두 점이 다 찍히고, 에러 없이 다각형 좌표가 잘 만들어졌을 때만 렌더링 */}
              {flightPoints.length === 2 && flightPolygonCoords.length > 0 && (
                <>
                  {/* 1km 낙하 반경 범위 (반투명 파란색) */}
                  <Polygon
                    positions={flightPolygonCoords}
                    color="#3b82f6"
                    fillColor="#3b82f6"
                    fillOpacity={0.15}
                    weight={1}
                    interactive={false}
                  />

                  {/* 비행기 이동 중심선 (흰색 점선) */}
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
      </div>
    );
  }
);

MapView.displayName = "MapView";
export default MapView;
