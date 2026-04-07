import React, { memo, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import L from "leaflet";
import Sidebar from "../Sidebar";
import MobileBottomSheet from "./MobileBottomSheet";
import MapView from "./MapView";
import { X, Hammer, Map as MapIcon, Crosshair, Plane, AlertCircle, SlidersHorizontal } from 'lucide-react';
import type { MapTab, MapMarker, AuthUser, PendingVehicle } from "../../types/map";
import { useTelemetry } from "../../hooks/useTelemetry";
import TelemetryPlayer from "./TelemetryPlayer";
import KillFeed from "./KillFeed";
import ZoneTimer from "./ZoneTimer";
import HomeNotice from "./HomeNotice";

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
  onSetSidebarOpen: (isOpen: boolean) => void;
  onToggleFilter: (id: string) => void;
  onGetCount: (id: string) => number;
  onEnableDefaultVehicleFilters?: () => void;
  currentUser: AuthUser | null;
  isAdmin?: boolean;
  pendingVehicles: PendingVehicle[];
}

const getDistanceToLineSegment = (
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) => {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
};

const MapShell = memo(
  ({
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
    onSetSidebarOpen,
    onToggleFilter,
    onGetCount,
    onEnableDefaultVehicleFilters,
    currentUser,
    isAdmin,
    pendingVehicles,
  }: MapShellProps) => {
    const router = useRouter();
    const searchParams = useSearchParams();

    const playbackId = searchParams?.get("playback") || null;
    const playbackNickname = searchParams?.get("nickname") || null;
    
    const {
      events: telemetryEvents,
      teammates: telemetryTeammates,
      loading: telemetryLoading,
      error: telemetryError,
      isPlaying,
      setIsPlaying,
      playbackSpeed,
      setPlaybackSpeed,
      currentTimeMs,
      setCurrentTimeMs,
      maxTimeMs,
      currentStates,
      teamNames,
      zoneEvents,
    } = useTelemetry(playbackId, playbackNickname, activeMapId);

    const [activeMode, setActiveMode] = useState<
      "none" | "mortar" | "flight" | "report"
    >("none");
    const [mortarPoints, setMortarPoints] = useState<L.LatLng[]>([]);
    const [flightPoints, setFlightPoints] = useState<L.LatLng[]>([]);
    const [reportLocation, setReportLocation] = useState<L.LatLng | null>(null);
    const [isVehicleFilterOn, setIsVehicleFilterOn] = useState(false);
    const [isGridOn, setIsGridOn] = useState(true);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showZone, setShowZone] = useState(true);
    const [showCombatDots, setShowCombatDots] = useState(false);
    const [showShotDots, setShowShotDots] = useState(true);
    const [hiddenPlayers, setHiddenPlayers] = useState<string[]>([]);
    const [showPlayerNames, setShowPlayerNames] = useState(true);
    const [showPlayerPaths, setShowPlayerPaths] = useState(true);

    useEffect(() => {
      setIsMenuOpen(false);
    }, [activeMapId]);

    const mapScale = 8192 / imageWidth;
    const pxPerMeter = imageWidth / 8192;

    const handleModeToggle = (mode: "mortar" | "flight" | "report") => {
      setActiveMode(activeMode === mode ? "none" : mode);
      setMortarPoints([]);
      setFlightPoints([]);
      setIsVehicleFilterOn(false);
      setReportLocation(null);
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
    if (
      activeMode === "flight" &&
      flightPoints.length === 2 &&
      isVehicleFilterOn
    ) {
      const p1 = flightPoints[0];
      const p2 = flightPoints[1];
      displayedVehicles = visibleVehicles.filter((v) => {
        const distPx = getDistanceToLineSegment(
          v.x,
          v.y,
          p1.lng,
          p1.lat,
          p2.lng,
          p2.lat
        );
        const radiusMeters = distPx * mapScale;
        const isNotVehicleStr = v.type === "Key" || v.type === "SecretRoom" || v.type === "SecurityCard";
        return radiusMeters <= 1000 && !isNotVehicleStr;
      });
    }

    return (
      <div className="flex w-full h-full overflow-hidden">
        {!isMobile ? (
          <Sidebar
            isOpen={isSidebarOpen}
            setIsOpen={onSetSidebarOpen}
            mapLabel={currentMap?.label || "지도"}
            activeMapId={activeMapId}
            filters={filters}
            toggleFilter={onToggleFilter}
            getCount={onGetCount}
          />
        ) : (
          <MobileBottomSheet
            isOpen={isSidebarOpen}
            setIsOpen={onSetSidebarOpen}
            mapLabel={currentMap?.label || "지도"}
            activeMapId={activeMapId}
            filters={filters}
            toggleFilter={onToggleFilter}
            getCount={onGetCount}
          />
        )}

        <div className="relative flex-1 h-full overflow-hidden">
          <HomeNotice />

          {/* 🌟 플로팅 지도 도구/필터 버튼 - 모바일 대칭 배치 */}
          <div className={`absolute z-[1000] flex w-full pointer-events-none transition-all ${isMobile ? 'bottom-[100px] px-6 safe-bottom' : 'top-4 right-4 justify-end'}`}>
            <div className={`flex w-full items-end ${isMobile ? 'justify-between' : 'flex-col gap-3'}`}>
              
              {/* 모바일 전용 필터 버튼 (좌측) */}
              {isMobile && (
                <button
                  onClick={() => onSetSidebarOpen(!isSidebarOpen)}
                  className="pointer-events-auto flex items-center justify-center w-[52px] h-[52px] bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl active:scale-90 transition-all text-[#F2A900]"
                >
                  <SlidersHorizontal size={22} strokeWidth={2.5} />
                </button>
              )}

              {/* 지도 도구 버튼 (우측) */}
              <div className="flex flex-col gap-3 items-end">
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className={`pointer-events-auto flex items-center gap-2 px-6 shadow-[0_12px_40px_rgba(0,0,0,0.4)] active:scale-90 transition-all duration-300 border border-white/5 ${isMenuOpen ? "bg-red-600 text-white h-[52px] rounded-2xl text-sm" : "bg-black text-[#F2A900] h-[52px] rounded-2xl text-base"}`}
                >
                  {isMenuOpen ? (
                    <>
                      <X size={18} strokeWidth={3} />
                      <span className="font-black uppercase tracking-tight text-xs">닫기</span>
                    </>
                  ) : (
                    <>
                      <Hammer size={18} strokeWidth={3} />
                      {isMobile ? null : <span className="font-black uppercase tracking-tight text-xs">지도 도구</span>}
                    </>
                  )}
                </button>

                {isMenuOpen && (
                  <div className="flex flex-col gap-2.5 items-end animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <button
                      onClick={() => setIsGridOn(!isGridOn)}
                      className={`pointer-events-auto flex items-center gap-2.5 px-5 py-3.5 border border-white/10 rounded-xl font-black text-xs shadow-2xl transition-all active:scale-95 ${isGridOn ? "bg-[#F2A900] text-black" : "bg-[#1a1a1a] text-[#777]"}`}
                    >
                      <MapIcon size={16} strokeWidth={3} />
                      <span className="uppercase tracking-tighter">그리드망 {isGridOn ? "ON" : "OFF"}</span>
                    </button>
                    <button
                      onClick={() => handleModeToggle("mortar")}
                      className={`pointer-events-auto flex items-center gap-2.5 px-5 py-3.5 border border-white/10 rounded-xl font-black text-xs shadow-2xl transition-all active:scale-95 ${activeMode === "mortar" ? "bg-[#ea4335] text-white" : "bg-[#1a1a1a] text-[#777]"}`}
                    >
                      <Crosshair size={16} strokeWidth={3} />
                      <span className="uppercase tracking-tighter">박격포</span>
                    </button>
                    <button
                      onClick={() => handleModeToggle("flight")}
                      className={`pointer-events-auto flex items-center gap-2.5 px-5 py-3.5 border border-white/10 rounded-xl font-black text-xs shadow-2xl transition-all active:scale-95 ${activeMode === "flight" ? "bg-[#3b82f6] text-white" : "bg-[#1a1a1a] text-[#777]"}`}
                    >
                      <Plane size={16} strokeWidth={3} />
                      <span className="uppercase tracking-tighter">비행기 경로</span>
                    </button>
                    <button
                      onClick={() => handleModeToggle("report")}
                      className={`pointer-events-auto flex items-center gap-2.5 px-5 py-3.5 border border-white/10 rounded-xl font-black text-xs shadow-2xl transition-all active:scale-95 ${activeMode === "report" ? "bg-[#10b981] text-white" : "bg-[#1a1a1a] text-[#777]"}`}
                    >
                      <AlertCircle size={16} strokeWidth={3} />
                      <span className="uppercase tracking-tighter">차량 제보</span>
                    </button>
                    {activeMode === "flight" && flightPoints.length === 2 && (
                      <button
                        onClick={() => {
                          const nextState = !isVehicleFilterOn;
                          setIsVehicleFilterOn(nextState);
                          if (nextState && onEnableDefaultVehicleFilters)
                            onEnableDefaultVehicleFilters();
                        }}
                        className={`pointer-events-auto mt-2 px-5 py-2.5 bg-black border-2 border-[#F2A900] rounded-full font-black text-[11px] text-[#F2A900] shadow-[0_0_20px_rgba(242,169,0,0.2)] animate-pulse`}
                      >
                        🚗 1km 주변 스캔 {isVehicleFilterOn ? "ON" : "OFF"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {activeMode !== "none" && (
            <div className={`absolute left-1/2 -translate-x-1/2 z-[1000] bg-black/70 text-white px-4 py-2 rounded-[20px] text-[13px] pointer-events-none font-bold border border-[#444] whitespace-nowrap ${isMobile ? 'top-[60px]' : 'top-[15px]'}`}>
              {activeMode === "mortar" &&
                "📍 [박격포] 내 위치와 타겟을 클릭하세요"}
              {activeMode === "flight" &&
                "📍 [비행기] 출발지와 도착지를 클릭하세요"}
              {activeMode === "report" &&
                "🚨 [제보] 지도에 차량 위치를 좌클릭하세요!"}
              <span className="text-[#F2A900] ml-2.5">
                (우클릭: 취소)
              </span>
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
            setActiveMode={setActiveMode}
            setReportLocation={setReportLocation}
            reportLocation={reportLocation}
            currentUser={currentUser}
            isAdmin={isAdmin}
            pendingVehicles={playbackId ? [] : pendingVehicles}
            filters={filters}
            telemetryData={{
              isActive: !!playbackId,
              mapName: activeMapId || "Erangel",
              events: telemetryEvents,
              currentTimeMs,
              currentStates,
              teamNames,
              zoneEvents,
              showZone,
              showCombatDots,
              showShotDots,
              hiddenPlayers,
              showPlayerNames,
              showPlayerPaths,
              teammates: telemetryTeammates
            }}
          />

          {playbackId && (
            <TelemetryPlayer
              events={telemetryEvents}
              teamNames={teamNames}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
              playbackSpeed={playbackSpeed}
              setPlaybackSpeed={setPlaybackSpeed}
              currentTimeMs={currentTimeMs}
              setCurrentTimeMs={setCurrentTimeMs}
              maxTimeMs={maxTimeMs}
              loading={telemetryLoading}
              error={telemetryError}
              showZone={showZone}
              onToggleZone={() => setShowZone((p) => !p)}
              showCombatDots={showCombatDots}
              onToggleCombatDots={() => setShowCombatDots((p) => !p)}
              showShotDots={showShotDots}
              onToggleShotDots={() => setShowShotDots((p) => !p)}
              hiddenPlayers={hiddenPlayers}
              onTogglePlayer={(name) => {
                setHiddenPlayers(prev => 
                  prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
                );
              }}
              showPlayerNames={showPlayerNames}
              onTogglePlayerNames={() => setShowPlayerNames(p => !p)}
              showPlayerPaths={showPlayerPaths}
              onTogglePlayerPaths={() => setShowPlayerPaths(p => !p)}
              onClose={() => {
                const newParams = new URLSearchParams(searchParams?.toString() || "");
                newParams.delete("playback");
                newParams.delete("nickname");
                router.push(`/?${newParams.toString()}`);
              }}
            />
          )}

          {playbackId && telemetryEvents.length > 0 && (
            <KillFeed
              events={telemetryEvents}
              currentTimeMs={currentTimeMs}
              teamNames={teamNames}
              playbackSpeed={playbackSpeed}
            />
          )}

          {playbackId && zoneEvents.length > 0 && (
            <ZoneTimer
              zoneEvents={zoneEvents}
              currentTimeMs={currentTimeMs}
              showZone={showZone}
            />
          )}
        </div>
      </div>
    );
  }
);

MapShell.displayName = "MapShell";
export default MapShell;
