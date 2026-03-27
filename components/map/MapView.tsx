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
  CircleMarker, // 🌟 [추가]
  useMapEvents,
} from "react-leaflet";
import L, { CRS } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapTab, MapMarker, AuthUser, PendingVehicle } from "../../types/map";
import ReportForm from "./ReportForm";
import { supabase } from "../../lib/supabase";

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
const reportPlacementIcon = L.divIcon({
  className: "custom-report-placement",
  html: `
    <div class="relative flex items-center justify-center">
      <div class="absolute w-8 h-8 bg-green-500 rounded-full opacity-40 animate-ping"></div>
      <div class="relative w-5 h-5 bg-green-600 border-2 border-white rounded-full flex items-center justify-center font-bold text-white text-xs shadow-lg">?</div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

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

interface MapInteractionProps {
  activeMode: "none" | "mortar" | "flight" | "report";
  setMortarPoints: React.Dispatch<React.SetStateAction<L.LatLng[]>>;
  setFlightPoints: React.Dispatch<React.SetStateAction<L.LatLng[]>>;
  setIsVehicleFilterOn: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveMode: React.Dispatch<
    React.SetStateAction<"none" | "mortar" | "flight" | "report">
  >;
  setReportLocation: React.Dispatch<React.SetStateAction<L.LatLng | null>>;
}

const MapInteraction = ({
  activeMode,
  setMortarPoints,
  setFlightPoints,
  setIsVehicleFilterOn,
  setActiveMode,
  setReportLocation,
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
      } else if (activeMode === "report") {
        setReportLocation(null);
        setTimeout(() => setReportLocation(e.latlng), 10);
      }
    },
    contextmenu(e) {
      e.originalEvent.preventDefault();
      if (activeMode === "mortar") setMortarPoints([]);
      if (activeMode === "flight") {
        setFlightPoints([]);
        setIsVehicleFilterOn(false);
      }
      if (activeMode === "report") {
        setActiveMode("none");
        setReportLocation(null);
      }
    },
  });
  return null;
};

interface MapViewProps {
  activeMapId: string;
  currentMap: MapTab | undefined;
  bounds: [[number, number], [number, number]];
  icons: Record<string, L.DivIcon>;
  imageHeight: number;
  imageWidth: number;
  activeMode: "none" | "mortar" | "flight" | "report";
  mortarPoints: L.LatLng[];
  flightPoints: L.LatLng[];
  flightPolygonCoords: [number, number][];
  displayedVehicles: MapMarker[];
  isGridOn: boolean;
  mapScale: number;
  setMortarPoints: React.Dispatch<React.SetStateAction<L.LatLng[]>>;
  setFlightPoints: React.Dispatch<React.SetStateAction<L.LatLng[]>>;
  setIsVehicleFilterOn: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveMode: React.Dispatch<
    React.SetStateAction<"none" | "mortar" | "flight" | "report">
  >;
  setReportLocation: React.Dispatch<React.SetStateAction<L.LatLng | null>>;
  reportLocation: L.LatLng | null;
  currentUser: AuthUser | null;
  pendingVehicles: PendingVehicle[]; // 🌟 추가
  filters: Record<string, boolean>; // 🌟 추가
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
    setActiveMode,
    setReportLocation,
    reportLocation,
    currentUser,
    pendingVehicles,
    filters, // 🌟 추가
  }: MapViewProps) => {
    const handleCloseReport = () => {
      setReportLocation(null);
      setActiveMode("none");
    };

    const handleVote = async (
      markerId: string | number,
      voteType: "up" | "down"
    ) => {
      if (!currentUser) return alert("로그인 후 참여 가능합니다.");

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return alert("인증 정보가 만료되었습니다. 다시 로그인 해 주세요.");

      try {
        const res = await fetch("/api/report/vote", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ markerId, voteType }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "처리 오류");

        alert(`[${voteType === "up" ? "진실" : "거짓"}] 평가 완료! 3초 후 자동 적용됩니다.`);
        setTimeout(() => window.location.reload(), 2000);

        if (data.triggerNotify) {
          fetch("/api/report/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ markerId, type: data.triggerNotify }),
          }).catch(console.error);
        }
      } catch (e: any) {
        alert(e.message);
      }
    };

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
        {currentMap && (
          <TileLayer
            url={`/tiles/${activeMapId}/{z}/{x}/{y}.jpg`}
            minZoom={-4}
            maxZoom={2}
            maxNativeZoom={0}
            zoomOffset={5}
            bounds={bounds}
            noWrap={true}
          />
        )}
        {isGridOn && <PUBGGrid />}
        <MapInteraction
          activeMode={activeMode}
          setMortarPoints={setMortarPoints}
          setFlightPoints={setFlightPoints}
          setIsVehicleFilterOn={setIsVehicleFilterOn}
          setActiveMode={setActiveMode}
          setReportLocation={setReportLocation}
        />

        {activeMode === "report" && reportLocation && (
          <Marker position={reportLocation} icon={reportPlacementIcon}>
            <Popup
              autoClose={false}
              closeButton={false}
              className="custom-report-popup"
              maxWidth={300}
            >
              <ReportForm
                location={reportLocation}
                activeMapId={activeMapId}
                icons={icons}
                currentUser={currentUser}
                onClose={handleCloseReport}
              />
            </Popup>
          </Marker>
        )}

        {displayedVehicles.map((v) => (
          <Marker
            key={v.id}
            position={[v.y, v.x]}
            icon={icons[v.type] || icons["Esports"]}
          >
            <Popup>{v.name}</Popup>
          </Marker>
        ))}

        {/* 🌟 진행 중인 제보 히트맵 표시! */}
        {filters["pending"] &&
          pendingVehicles.map((v) => {
            const weight = v.weight || 1;
            const radius = 15 + weight * 4;
            const color = weight >= 5 ? "#ef4444" : "#f59e0b";
            return (
              <CircleMarker
                key={v.id}
                center={[v.y, v.x]}
                radius={radius}
                color={color}
                fillColor={color}
                fillOpacity={0.4}
                weight={2}
              >
                <Popup>
                  <div style={{ textAlign: "center", minWidth: "160px", padding: "4px" }}>
                    <b style={{ fontSize: "14px", color: "#333", display: "block", marginBottom: "4px" }}>
                      👀 제보 확인 중
                    </b>
                    <span style={{ fontSize: "13px", color: "#666" }}>
                      종류: <b>{v.marker_type}</b>
                    </span>
                    <hr style={{ margin: "8px 0" }} />
                    <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                      <button
                        onClick={() => handleVote(v.id, "up")}
                        title="진실 (추천)"
                        style={{
                          flex: 1, backgroundColor: "#10b981", color: "white",
                          border: "none", borderRadius: "4px", padding: "6px",
                          cursor: "pointer", fontWeight: "bold", fontSize: "12px"
                        }}
                      >
                        👍 진실 ({weight})
                      </button>
                      <button
                        onClick={() => handleVote(v.id, "down")}
                        title="거짓 (비추천)"
                        style={{
                          flex: 1, backgroundColor: "#ef4444", color: "white",
                          border: "none", borderRadius: "4px", padding: "6px",
                          cursor: "pointer", fontWeight: "bold", fontSize: "12px"
                        }}
                      >
                        👎 거짓 ({v.down_weight || 0})
                      </button>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

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
