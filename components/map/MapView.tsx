import React, { memo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Polygon,
  Tooltip,
  CircleMarker,
  Circle,         // 🔵 [추가] 자기장/안전구역 원 그리기용
  useMapEvents,
  useMap,
} from "react-leaflet";
import L, { CRS } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapTab, MapMarker, AuthUser, PendingVehicle } from "../../types/map";
import ReportForm from "./ReportForm";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner";

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

const MapResizer = () => {
  const map = useMap();
  React.useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(map.getContainer());
    return () => resizeObserver.disconnect();
  }, [map]);
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
  pendingVehicles: PendingVehicle[];
  filters: Record<string, boolean>;
  telemetryData?: any; // 🌟 추가
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
    filters,
    telemetryData, // 🌟 추가
  }: MapViewProps) => {
    const handleCloseReport = () => {
      setReportLocation(null);
      setActiveMode("none");
    };

    const handleVote = async (
      markerId: string | number,
      voteType: "up" | "down"
    ) => {
      if (!currentUser) return toast.error("로그인 후 참여 가능합니다.");

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return toast.warning("인증 정보가 만료되었습니다. 다시 로그인 해 주세요.");

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

        toast.success(`[${voteType === "up" ? "진실" : "거짓"}] 평가 완료!`, {
          description: "2초 후 지도에 반영됩니다.",
        });
        setTimeout(() => window.location.reload(), 2000);

        if (data.triggerNotify) {
          fetch("/api/report/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ markerId, type: data.triggerNotify }),
          }).catch(console.error);
        }
      } catch (e: any) {
        toast.error(e.message || "평가 중 오류가 발생했습니다.");
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
        {/* 🌟 기절 상태 맥박 효과 애니메이션 */}
        <style>{`
          @keyframes groggy-pulse {
            0% { transform: scale(1.0); opacity: 0.9; }
            70% { transform: scale(3.5); opacity: 0; }
            100% { transform: scale(1.0); opacity: 0; }
          }
          .groggy-pulse-effect {
            width: 24px;
            height: 24px;
            background: rgba(255, 0, 255, 0.8); /* 형광 핑크 (Magenta) */
            border-radius: 50%;
            animation: groggy-pulse 1.2s infinite ease-out;
            box-shadow: 0 0 12px rgba(255, 0, 255, 0.7);
          }
        `}</style>
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
        <MapResizer />
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

        {/* 🚀 텔레메트리 관련 렌더링 🚀 */}
        {telemetryData?.isActive && telemetryData.events?.length > 0 && (
          <>
            {/* 🔵🟢 자기장(블루존) + 안전구역(화이트존) 원 렌더링 */}
            {telemetryData.showZone !== false && (() => {
              const zones: any[] = telemetryData.zoneEvents ?? [];
              if (zones.length === 0) return null;

              // 현재 타임라인 시간 이하의 가장 최근 존 스냅샷을 찾기
              let latestZone: any = null;
              for (const z of zones) {
                if (z.relativeTimeMs <= telemetryData.currentTimeMs) {
                  latestZone = z;
                } else {
                  break;
                }
              }
              if (!latestZone) return null;

              return (
                <>
                  {/* 파란 원: 독가스 경계선 */}
                  {latestZone.blueX != null && latestZone.blueY != null && latestZone.blueRadius != null && (
                    <Circle
                      center={[latestZone.blueY, latestZone.blueX]}
                      radius={latestZone.blueRadius}
                      pathOptions={{
                        color: "#3b82f6",
                        fillColor: "#3b82f6",
                        fillOpacity: 0.06,
                        weight: 2.5,
                        opacity: 0.7,
                        dashArray: "6 4",
                      }}
                      interactive={false}
                    />
                  )}
                  {/* 하얀 원: 다음 안전구역 */}
                  {latestZone.whiteX != null && latestZone.whiteY != null && latestZone.whiteRadius != null && (
                    <Circle
                      center={[latestZone.whiteY, latestZone.whiteX]}
                      radius={latestZone.whiteRadius}
                      pathOptions={{
                        color: "#ffffff",
                        fillColor: "transparent",
                        fillOpacity: 0,
                        weight: 2,
                        opacity: 0.6,
                        dashArray: "4 6",
                      }}
                      interactive={false}
                    />
                  )}
                </>
              );
            })()}


            {/* 💥 실제 교전 위치 타격 이펙트 — 최근 6초 이내 킬/기절 발생 좌표에 폭발 효과 */}
            {(() => {
              const COMBAT_WINDOW_MS = 6000; // 게임 내 6초
              const COLORS = ["#F2A900", "#34A853", "#3b82f6", "#ef4444"];
              const teamNames: string[] = telemetryData.teamNames ?? [];

              const combatEvs = telemetryData.events.filter((ev: any) => {
                if (ev.type !== "kill" && ev.type !== "groggy") return false;
                if (ev.x == null || ev.y == null) return false;
                const diff = telemetryData.currentTimeMs - ev.relativeTimeMs;
                return diff >= 0 && diff <= COMBAT_WINDOW_MS;
              });

              return combatEvs.map((ev: any, i: number) => {
                const age = telemetryData.currentTimeMs - ev.relativeTimeMs;
                const lifeRatio = age / COMBAT_WINDOW_MS; // 0=갓 발생, 1=곧 사라짐
                const opacity = Math.max(0, 1 - lifeRatio);

                const attackerIdx = teamNames.indexOf(ev.attacker ?? "");
                const color = attackerIdx >= 0 ? COLORS[attackerIdx % COLORS.length] : "#ef4444";
                const isKill = ev.type === "kill";
                const innerSize = isKill ? 16 : 12;
                const outerSize = innerSize + 20;
                const emoji = isKill ? "💀" : "👊";

                const icon = L.divIcon({
                  html: `
                    <div style="position:relative;width:${outerSize}px;height:${outerSize}px;display:flex;align-items:center;justify-content:center;">
                      <!-- 펄스 링 -->
                      <div style="
                        position:absolute;
                        width:${outerSize}px;height:${outerSize}px;
                        border-radius:50%;
                        border:2px solid ${color};
                        opacity:${opacity * 0.6};
                        transform:scale(${1 + lifeRatio * 1.5});
                        transition:none;
                      "></div>
                      <!-- 중앙 이모지 -->
                      <span style="font-size:${innerSize}px;line-height:1;opacity:${opacity};">${emoji}</span>
                    </div>`,
                  className: "",
                  iconSize: [outerSize, outerSize],
                  iconAnchor: [outerSize / 2, outerSize / 2],
                });

                return (
                  <Marker
                    key={`combat-${i}-${ev.relativeTimeMs}`}
                    position={[ev.y, ev.x]}
                    icon={icon}
                    interactive={false}
                  />
                );
              });
            })()}

            {/* 🗺️ 교전 흔적 — 공격자 위치(팀컬러) + 피해자/적 위치(어두운 점) */}
            {telemetryData.showCombatDots !== false && (() => {
              const COLORS = ["#F2A900", "#34A853", "#3b82f6", "#ef4444"];
              const teamNames: string[] = telemetryData.teamNames ?? [];

              const allCombat = telemetryData.events.filter((ev: any) =>
                (ev.type === "kill" || ev.type === "groggy") &&
                ev.relativeTimeMs <= telemetryData.currentTimeMs
              );

              const markers: React.ReactNode[] = [];

              allCombat.forEach((ev: any, i: number) => {
                const isKill = ev.type === "kill";
                const isTeamInvolved = ev.isTeamAttacker || ev.isTeamVictim;
                const attackerIdx = teamNames.indexOf(ev.attacker ?? "");

                // 공격자 점
                if (ev.x && ev.y) {
                  let fillColor = "#333333";
                  let strokeColor = "#666";
                  if (ev.isTeamAttacker && attackerIdx >= 0) {
                    fillColor = COLORS[attackerIdx % COLORS.length];
                    strokeColor = fillColor;
                  } else if (ev.isTeamVictim) { // 적이 아군을 공격
                    fillColor = "#ff4444";
                    strokeColor = "#ff4444";
                  }
                  markers.push(
                    <CircleMarker
                      key={`cdot-atk-${i}-${ev.relativeTimeMs}`}
                      center={[ev.y, ev.x]}
                      radius={isKill ? 4 : 3}
                      pathOptions={{
                        color: strokeColor,
                        fillColor,
                        fillOpacity: isTeamInvolved ? 0.85 : 0.38,
                        weight: isTeamInvolved ? 1.5 : 0.5,
                        opacity: isTeamInvolved ? 0.9 : 0.45,
                      }}
                      interactive={false}
                    />
                  );
                }

                // 피해자(적) 위치 점 — 항상 어두운 검은 점
                if (ev.victimX && ev.victimY) {
                  const victimFill = ev.isTeamVictim ? "#ef4444" : "#111111";
                  markers.push(
                    <CircleMarker
                      key={`cdot-vic-${i}-${ev.relativeTimeMs}`}
                      center={[ev.victimY, ev.victimX]}
                      radius={isKill ? 3.5 : 2.5}
                      pathOptions={{
                        color: ev.isTeamVictim ? "#ff4444" : "#444",
                        fillColor: victimFill,
                        fillOpacity: ev.isTeamVictim ? 0.9 : 0.45,
                        weight: ev.isTeamVictim ? 1.5 : 0.5,
                        opacity: ev.isTeamVictim ? 0.9 : 0.5,
                      }}
                      interactive={false}
                    />
                  );
                }
              });

              return markers;
            })()}

            {/* 🔫 발사 이펙트 — 총을 쏜 순간 |/ 모양 빔 이펙트 */}
            {telemetryData.showShotDots === true && (() => {
              const COLORS = ["#F2A900", "#34A853", "#3b82f6", "#ef4444"];
              const teamNames: string[] = telemetryData.teamNames ?? [];

              // 최근 0.8초 이내 발사 이벤트만 보여줌 (섬광 효과를 위해 짧게 유지)
              const EFFECT_WINDOW_MS = 800; 
              const recentShots = telemetryData.events.filter((ev: any) => {
                const isEngage = ["shot", "kill", "groggy"].includes(ev.type);
                if (!isEngage || ev.x == null || ev.y == null) return false;
                
                // 킬/기절의 경우 피해자 대신 발사자(attacker) 위치에서 빔이 나가야 함
                const diff = telemetryData.currentTimeMs - ev.relativeTimeMs;
                return diff >= 0 && diff <= EFFECT_WINDOW_MS;
              });

              return recentShots.map((ev: any, i: number) => {
                const nameIdx = teamNames.indexOf(ev.name ?? "");
                const color = nameIdx >= 0 ? COLORS[nameIdx % COLORS.length] : "#ffffff";
                const age = telemetryData.currentTimeMs - ev.relativeTimeMs;
                const t = age / EFFECT_WINDOW_MS; // 0=갓발사, 1=사라짐

                // 방향 데이터 (vX, vY)가 있고 적어도 하나가 0이 아니면 빔으로 표시
                const hasDir = (typeof ev.vX === "number" && typeof ev.vY === "number") && (ev.vX !== 0 || ev.vY !== 0);
                if (!hasDir) {
                  // 방향 데이터가 없더라도 점보다는 작은 섬광(Burst)으로 표시하여 원형 핑 방지
                  const burstSize = 10;
                  return (
                    <CircleMarker
                      key={`shot-burst-${i}-${ev.relativeTimeMs}`}
                      center={[ev.y, ev.x]}
                      radius={(1 - t) * burstSize}
                      pathOptions={{
                        color: color,
                        fillColor: "#fff",
                        fillOpacity: (1 - t),
                        weight: 2
                      }}
                      interactive={false}
                    />
                  );
                } else {
                  // 🔫 방향 데이터가 있는 경우: 빔(Beam) + 머즐 플래시(Muzzle Flash)
                  const MAP_SIZES: any = { Erangel: 816000, Miramar: 816000, Sanhok: 408000, Karakin: 204000, Taego: 816000, Deston: 816000 };
                  const mapSize = MAP_SIZES[telemetryData.mapName] || 816000;
                  const beamLen = (3500 / mapSize) * 8192; // 35m로 더 길게
                  const endX = ev.x + (ev.vX || 0) * beamLen;
                  const endY = ev.y - (ev.vY || 0) * beamLen;

                  return (
                    <React.Fragment key={`shot-group-${i}-${ev.relativeTimeMs}`}>
                      {/* 빔 (직선) */}
                      <Polyline
                        positions={[[ev.y, ev.x], [endY, endX]]}
                        color={ev.type === "shot" ? color : "#ff3333"}
                        weight={(ev.type === "shot" ? 6 : 10) + (1-t) * 10}
                        opacity={(1 - t) * 0.8}
                        interactive={false}
                      />
                      {/* 머즐 플래시 (시작점 광원) */}
                      <CircleMarker
                        center={[ev.y, ev.x]}
                        radius={4 + (1-t) * 8}
                        pathOptions={{
                          color: "#fff",
                          fillColor: ev.type === "shot" ? color : "#ff0000",
                          fillOpacity: (1 - t) * 0.9,
                          weight: 1
                        }}
                        interactive={false}
                      />
                    </React.Fragment>
                  );
                }
              });
            })()}

            {/* 플레이어들의 이동 경로 꼬리 그리기 (전체 희미한 경로 + 최근 진한 경로) */}
            {telemetryData.showPlayerPaths !== false && Object.values(telemetryData.currentStates).map((player: any, idx: number) => {
              const playerName = player.name;
              if ((telemetryData.hiddenPlayers ?? []).includes(playerName)) return null;

              // 아군 색상 추출
              const teamIdx = telemetryData.teamNames?.indexOf(playerName);
              const colors = ["#F2A900", "#34A853", "#3b82f6", "#ef4444"];
              const trColor = player.isEnemy ? "#000000" : colors[(teamIdx ?? idx) % colors.length];

              const playerEvs = telemetryData.events.filter((e: any) => 
                (e.type === "position" || e.type === "enemy_position") && e.name === playerName && e.relativeTimeMs <= telemetryData.currentTimeMs
              );
              
              const fullPoints = playerEvs.map((e: any) => [e.y, e.x] as [number, number]);
              if (player.y !== undefined && player.x !== undefined) fullPoints.push([player.y, player.x]);
              if (fullPoints.length < 2) return null;
              
              const TAIL_DURATION_MS = player.isEnemy ? 15000 : 60000; // 적군은 15초, 아군은 60초 꼬리
              const recentEvs = playerEvs.filter((e: any) => e.relativeTimeMs >= telemetryData.currentTimeMs - TAIL_DURATION_MS);
              const recentPoints = recentEvs.map((e: any) => [e.y, e.x] as [number, number]);
              if (player.y !== undefined && player.x !== undefined && recentPoints.length >= 1) recentPoints.push([player.y, player.x]);

              return (
                <React.Fragment key={`track-${playerName}`}>
                  <Polyline
                    positions={fullPoints}
                    color={trColor}
                    weight={player.isEnemy ? 1.5 : 2}
                    opacity={player.isEnemy ? 0.25 : 0.2}
                    interactive={false}
                    dashArray={player.isEnemy ? "5, 10" : undefined}
                  />
                  {recentPoints.length >= 2 && (
                    <Polyline
                      positions={recentPoints}
                      color={trColor}
                      weight={player.isEnemy ? 3 : 4}
                      opacity={player.isEnemy ? 0.6 : 0.8}
                      interactive={false}
                    />
                  )}
                </React.Fragment>
              );
            })}


            {/* 현재 시간대 기반 플레이어 현재 위치 렌더링 */}
            {(() => {
              const COLORS = ["#F2A900", "#34A853", "#3b82f6", "#ef4444"];
              const allPlayers = Object.values(telemetryData.currentStates) as any[];
              const teamNames: string[] = telemetryData.teamNames ?? [];

              const deadPlayers = allPlayers.filter((p) => p.isDead);
              const groggyPlayers = allPlayers.filter((p) => !p.isDead && p.isGroggy);
              const footPlayers = allPlayers.filter((p) => !p.isDead && !p.isGroggy && !p.isInVehicle);
              const vehiclePlayers = allPlayers.filter((p) => !p.isDead && !p.isGroggy && p.isInVehicle);

              // vehicleId 기반으로 정확하게 그룹화 (없으면 proximity 보조)
              const VEHICLE_THRESHOLD = 400;
              const vehicleGroups: any[][] = [];
              const vehicleIdMap: Record<string, number> = {}; // vehicleId -> group index

              for (const player of vehiclePlayers) {
                const vid = player.vehicleId;
                if (vid && vehicleIdMap[vid] !== undefined) {
                  // 같은 vehicleId → 동일 그룹
                  vehicleGroups[vehicleIdMap[vid]].push(player);
                } else {
                  // vehicleId 없는 경우 위치 근접 보조 매칭
                  let placed = false;
                  if (!vid) {
                    for (const group of vehicleGroups) {
                      const rep = group[0];
                      const dist = Math.sqrt((player.x - rep.x) ** 2 + (player.y - rep.y) ** 2);
                      if (dist < VEHICLE_THRESHOLD) { group.push(player); placed = true; break; }
                    }
                  }
                  if (!placed) {
                    const newIdx = vehicleGroups.length;
                    vehicleGroups.push([player]);
                    if (vid) vehicleIdMap[vid] = newIdx;
                  }
                }
              }

              return (
                <>
                  {/* ☠️ 사망 마커 (해골) */}
                  {deadPlayers.map((player) => (
                    <Marker
                      key={`dead-${player.name}-${telemetryData.showPlayerNames}`}
                      position={[player.y, player.x]}
                      icon={L.divIcon({
                        html: `<div style="font-size:22px;text-align:center;filter: drop-shadow(0 0 5px rgba(255,0,0,0.5));">💀</div>`,
                        className: "telemetry-dead",
                        iconSize: [24, 24],
                      })}
                    >
                      <Tooltip 
                        direction="top" 
                        permanent 
                        opacity={telemetryData.showPlayerNames !== false ? 1 : 0}
                        className={`bg-black/90 border-none text-red-500 font-bold shadow-none text-[10px] ${telemetryData.showPlayerNames === false ? 'hidden-tooltip' : ''}`}
                      >
                        {player.name} (사망)
                      </Tooltip>
                    </Marker>
                  ))}

                  {/* 🏥 기절 마커 (Pink Pulse 효과) */}
                  {groggyPlayers.map((player) => (
                    <React.Fragment key={`groggy-group-${player.name}-${telemetryData.showPlayerNames}`}>
                      <Marker
                        position={[player.y, player.x]}
                        interactive={false}
                        icon={L.divIcon({
                          html: `<div class="groggy-pulse-effect"></div>`,
                          className: "",
                          iconSize: [24, 24],
                          iconAnchor: [12, 12]
                        })}
                      />
                       <CircleMarker
                         center={[player.y, player.x]}
                         radius={8}
                         pathOptions={{
                           color: "#fff",
                           fillColor: "#FF00FF", // 형광 핑크 (Magenta)
                           fillOpacity: 1,
                           weight: 2,
                         }}
                       >
                         <Tooltip 
                           direction="top" 
                           permanent 
                           opacity={telemetryData.showPlayerNames ? 1 : 0}
                           className={`bg-black/90 border-none text-pink-400 font-extrabold shadow-none text-[11px] z-[1000] ${!telemetryData.showPlayerNames ? 'hidden-tooltip' : ''}`}
                         >
                           🆘 {player.name} (기절)
                         </Tooltip>
                       </CircleMarker>
                    </React.Fragment>
                  ))}

                  {/* 🚶 도보 플레이어 — 개별 CircleMarker */}
                  {footPlayers.map((player) => {
                    const ni = teamNames.indexOf(player.name);
                    const color = player.isEnemy ? "#000000" : COLORS[(ni >= 0 ? ni : 0) % COLORS.length];
                    const isHidden = (telemetryData.hiddenPlayers ?? []).includes(player.name);
                    if (isHidden) return null;
                    return (
                      <CircleMarker
                        key={`foot-${player.name}-${telemetryData.showPlayerNames}`}
                        center={[player.y, player.x]}
                        radius={player.isEnemy ? 4.5 : 6}
                        pathOptions={{ 
                          color: player.isEnemy ? "#000" : "#fff", 
                          fillColor: color, 
                          fillOpacity: 1, 
                          weight: player.isEnemy ? 1.5 : 2 
                        }}
                      >
                        <Tooltip 
                          direction="top" 
                          permanent 
                          opacity={telemetryData.showPlayerNames !== false ? (player.isEnemy ? 0.7 : 1) : 0}
                          className={`${player.isEnemy ? 'bg-gray-900/90 text-gray-300' : 'bg-black/80 text-white'} border-none font-bold text-[10px] p-1 ${telemetryData.showPlayerNames === false ? 'hidden-tooltip' : ''}`}
                        >
                          {player.name}{player.isEnemy ? ' (적)' : ''}
                        </Tooltip>
                      </CircleMarker>
                    );
                  })}

                  {/* 🚗 차량 탑승 그룹 마커 — 그룹당 하나의 마커 */}
                  {vehicleGroups.map((group, gi) => {
                    const rep = group[0]; // 대표 좌표 = 첫 번째 탑승자
                    const passengerCount = group.length;

                    // 탑승자 색상 점 HTML (최대 4개)
                    const dotHtml = group
                      .map((p) => {
                        const ni = teamNames.indexOf(p.name);
                        const c = COLORS[(ni >= 0 ? ni : 0) % COLORS.length];
                        return `<div style="width:8px;height:8px;border-radius:50%;background:${c};border:1.5px solid #fff;flex-shrink:0;"></div>`;
                      })
                      .join("");

                    const iconHtml = `
                      <div style="
                        display:flex;flex-direction:column;align-items:center;
                        background:rgba(10,10,10,0.88);
                        border:2px solid rgba(255,255,255,0.5);
                        border-radius:10px;padding:3px 6px 3px 6px;
                        box-shadow:0 2px 8px rgba(0,0,0,0.6);
                        min-width:${passengerCount > 1 ? 44 : 30}px;
                        gap:2px;pointer-events:auto;
                      ">
                        <span style="font-size:${passengerCount > 1 ? 16 : 14}px;line-height:1;">🚗</span>
                        <div style="display:flex;gap:3px;justify-content:center;">${dotHtml}</div>
                      </div>`;

                    // 탑승자 이름 목록 (툴팁용)
                    const names = group.map((p: any) => {
                      const ni = teamNames.indexOf(p.name);
                      const c = COLORS[(ni >= 0 ? ni : 0) % COLORS.length];
                      return `<span style="color:${c};font-weight:bold;">${p.name}</span>`;
                    }).join(" · ");

                    const w = passengerCount > 1 ? 52 : 38;
                    const h = 44;

                    return (
                      <Marker
                        key={`vehicle-group-${gi}-${telemetryData.showPlayerNames}`}
                        position={[rep.y, rep.x]}
                        icon={L.divIcon({
                          html: iconHtml,
                          className: "",
                          iconSize: [w, h],
                          iconAnchor: [w / 2, h / 2],
                        })}
                      >
                        <Tooltip 
                          direction="top" 
                          permanent 
                          opacity={telemetryData.showPlayerNames !== false ? 1 : 0}
                          className={`bg-black/90 border border-white/20 text-[11px] p-1.5 font-bold ${telemetryData.showPlayerNames === false ? 'hidden-tooltip' : ''}`}
                        >
                          <div dangerouslySetInnerHTML={{ __html: `🚗 탑승 중: ${names}` }} />
                        </Tooltip>
                      </Marker>
                    );
                  })}
                </>
              );
            })()}
          </>
        )}
      </MapContainer>
    );
  }
);

MapView.displayName = "MapView";
export default MapView;
