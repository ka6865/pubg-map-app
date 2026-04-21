import React, { memo, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import L from "leaflet";
import Sidebar from "../Sidebar";
import MobileBottomSheet from "./MobileBottomSheet";
import MapView from "./MapView";
import { X, Hammer, Map as MapIcon, Crosshair, Plane, AlertCircle, SlidersHorizontal, Menu, Flame, Grid, MapPin } from 'lucide-react';
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
    const [isHotDropOn, setIsHotDropOn] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showZone, setShowZone] = useState(true);
    const [showCombatDots, setShowCombatDots] = useState(false);
    const [showShotDots, setShowShotDots] = useState(true);
    const [hiddenPlayers, setHiddenPlayers] = useState<string[]>([]);
    const [showPlayerNames, setShowPlayerNames] = useState(true);
    const [showPlayerPaths, setShowPlayerPaths] = useState(true);

    const [prevMapId, setPrevMapId] = useState(activeMapId);
    if (activeMapId !== prevMapId) {
      setPrevMapId(activeMapId);
      setIsMenuOpen(false);
    }

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

          <div className={`absolute z-[1000] flex w-full pointer-events-none transition-all ${isMobile ? 'bottom-[72px] px-6 safe-bottom' : 'top-4 right-4 justify-end'}`}>
            <div className={`flex w-full items-start ${isMobile ? 'justify-between items-end' : 'justify-end'}`}>
              
              {/* 데스크탑 사이드바 열기 버튼 (좌측 상단 - MapHeader 제거 후 대비) */}
              {!isMobile && !isSidebarOpen && (
                <button
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSetSidebarOpen(true);
                  }}
                  className="pointer-events-auto absolute left-4 top-0 flex items-center justify-center w-[44px] h-[44px] bg-black/80 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl active:scale-90 transition-all text-white hover:text-[#F2A900] z-[5000]"
                >
                  <Menu size={22} strokeWidth={2.5} />
                </button>
              )}

              {/* 모바일 전용 필터 버튼 (좌측) */}
              {isMobile && (
                <button
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSetSidebarOpen(!isSidebarOpen);
                  }}
                  className="pointer-events-auto flex items-center justify-center w-[52px] h-[52px] bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl active:scale-90 transition-all text-[#F2A900]"
                >
                  <SlidersHorizontal size={22} strokeWidth={2.5} />
                </button>
              )}

              {/* 지도 도구 버튼 (우측) */}
              <div className="flex flex-col gap-3 items-end pointer-events-auto">
                {/* 핫드랍 버튼은 지도 도구 내부로 통합됨 */}

                <button
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setIsMenuOpen(!isMenuOpen);
                  }}
                  className={`pointer-events-auto flex items-center gap-2 px-6 shadow-[0_12px_40px_rgba(0,0,0,0.4)] active:scale-90 transition-all duration-300 border border-white/5 ${isMenuOpen ? "bg-red-600 text-white h-[52px] rounded-2xl text-sm" : "bg-black/80 backdrop-blur-xl text-[#F2A900] h-[52px] rounded-2xl text-base"}`}
                >
                  {isMenuOpen ? (
                    <>
                      <X size={18} strokeWidth={3} />
                      <span className="font-black uppercase tracking-tight text-xs">닫기</span>
                    </>
                  ) : (
                    <>
                      <Hammer size={18} strokeWidth={3} />
                      <span className="font-black uppercase tracking-tight text-xs">{isMobile ? "도구" : "지도 도구"}</span>
                    </>
                  )}
                </button>

                {isMenuOpen && !isMobile && (
                  <div className="flex flex-col gap-2.5 items-end animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <button
                      onClick={() => setIsHotDropOn(!isHotDropOn)}
                      className={`pointer-events-auto flex items-center gap-2.5 px-5 py-3.5 border border-white/10 rounded-xl font-black text-xs shadow-2xl transition-all active:scale-95 ${
                        isHotDropOn 
                          ? "bg-gradient-to-r from-orange-500 to-red-600 text-white border-orange-400" 
                          : "bg-[#1a1a1a] text-orange-500 hover:text-orange-400"
                      }`}
                    >
                      <div className="relative">
                        <Flame size={16} strokeWidth={3} className={isHotDropOn ? "animate-pulse" : ""} />
                        {isHotDropOn && (
                          <span className="absolute inset-0 bg-orange-400 blur-md opacity-50 animate-ping"></span>
                        )}
                      </div>
                      <span className="uppercase tracking-tighter">핫드랍 {isHotDropOn ? "ON" : "OFF"}</span>
                    </button>
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

          {/* ✨ 모바일 가로 툴바 (추천 방식: 아이콘 + 미니 라벨) */}
          {isMobile && isMenuOpen && (
            <div className="fixed bottom-[136px] left-0 right-0 z-[2000] px-4 animate-in fade-in slide-in-from-bottom-6 duration-500 pointer-events-none">
              <div className="max-w-md mx-auto pointer-events-auto overflow-hidden">
                <div 
                  className="flex gap-2.5 overflow-x-auto no-scrollbar p-3 bg-black/70 backdrop-blur-2xl border border-white/10 rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
                  style={{
                    maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
                    WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)'
                  }}
                >
                  {/* 핫드랍 토글 */}
                  <button
                    onClick={() => setIsHotDropOn(!isHotDropOn)}
                    className={`flex flex-col items-center justify-center min-w-[72px] h-[72px] rounded-2xl transition-all active:scale-95 border ${
                      isHotDropOn 
                        ? "bg-gradient-to-br from-orange-500/20 to-red-600/20 border-orange-500/50 text-orange-500" 
                        : "bg-white/5 border-white/5 text-white/40"
                    }`}
                  >
                    <Flame size={20} className={isHotDropOn ? "animate-pulse" : ""} />
                    <span className={`text-[10px] font-black mt-1.5 uppercase tracking-tighter ${isHotDropOn ? "text-orange-500" : "text-white/40"}`}>핫드랍</span>
                  </button>

                  {/* 격자 토글 */}
                  <button
                    onClick={() => setIsGridOn(!isGridOn)}
                    className={`flex flex-col items-center justify-center min-w-[72px] h-[72px] rounded-2xl transition-all active:scale-95 border ${
                      isGridOn 
                        ? "bg-white/10 border-white/20 text-[#F2A900]" 
                        : "bg-white/5 border-white/5 text-white/40"
                    }`}
                  >
                    <Grid size={20} />
                    <span className={`text-[10px] font-black mt-1.5 uppercase tracking-tighter ${isGridOn ? "text-[#F2A900]" : "text-white/40"}`}>격자</span>
                  </button>

                  {/* 박격포 모드 */}
                  <button
                    onClick={() => {
                      handleModeToggle("mortar");
                      setIsMenuOpen(false);
                    }}
                    className={`flex flex-col items-center justify-center min-w-[72px] h-[72px] rounded-2xl transition-all active:scale-95 border ${
                      activeMode === "mortar" 
                        ? "bg-blue-500/20 border-blue-500/50 text-blue-400" 
                        : "bg-white/5 border-white/5 text-white/40"
                    }`}
                  >
                    <Crosshair size={20} />
                    <span className={`text-[10px] font-black mt-1.5 uppercase tracking-tighter ${activeMode === "mortar" ? "text-blue-400" : "text-white/40"}`}>박격포</span>
                  </button>

                  {/* 비행기 라인 */}
                  <button
                    onClick={() => {
                      handleModeToggle("flight");
                      setIsMenuOpen(false);
                    }}
                    className={`flex flex-col items-center justify-center min-w-[72px] h-[72px] rounded-2xl transition-all active:scale-95 border ${
                      activeMode === "flight" 
                        ? "bg-purple-500/20 border-purple-500/50 text-purple-400" 
                        : "bg-white/5 border-white/5 text-white/40"
                    }`}
                  >
                    <Plane size={20} />
                    <span className={`text-[10px] font-black mt-1.5 uppercase tracking-tighter ${activeMode === "flight" ? "text-purple-400" : "text-white/40"}`}>비행기</span>
                  </button>

                  {/* 제보하기 */}
                  <button
                    onClick={() => {
                      handleModeToggle("report");
                      setIsMenuOpen(false);
                    }}
                    className={`flex flex-col items-center justify-center min-w-[72px] h-[72px] rounded-2xl transition-all active:scale-95 border ${
                      activeMode === "report" 
                        ? "bg-green-500/20 border-green-500/50 text-green-400" 
                        : "bg-white/5 border-white/5 text-white/40"
                    }`}
                  >
                    <MapPin size={20} />
                    <span className={`text-[10px] font-black mt-1.5 uppercase tracking-tighter ${activeMode === "report" ? "text-green-400" : "text-white/40"}`}>제보</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {(activeMode !== "none" || isHotDropOn) && (
            <div className={`absolute left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-3 pointer-events-none ${isMobile ? 'bottom-[136px]' : 'top-[15px]'}`}>
              {/* 모바일 전용: 비행기 주변 1km 스캔 버튼 */}
              {isMobile && activeMode === "flight" && flightPoints.length === 2 && (
                <button
                  onClick={() => {
                    const nextState = !isVehicleFilterOn;
                    setIsVehicleFilterOn(nextState);
                    if (nextState && onEnableDefaultVehicleFilters) onEnableDefaultVehicleFilters();
                  }}
                  className={`pointer-events-auto px-6 py-3 border-2 rounded-full font-black text-xs shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all active:scale-95 flex items-center gap-2 ${
                    isVehicleFilterOn 
                      ? "bg-[#F2A900] border-[#F2A900] text-black" 
                      : "bg-black/80 border-[#F2A900] text-[#F2A900] backdrop-blur-md"
                  }`}
                >
                  <span className="text-base">🚗</span>
                  <span className="uppercase tracking-tight">비행기 주변 1km 스캔 {isVehicleFilterOn ? "ON" : "OFF"}</span>
                </button>
              )}

              {activeMode !== "none" && (
                <div className="bg-black/70 backdrop-blur-md text-white px-5 py-2.5 rounded-[20px] text-[13px] font-bold border border-white/10 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
                  {activeMode === "mortar" && "📍 [박격포] 내 위치와 타겟을 클릭하세요"}
                  {activeMode === "flight" && (flightPoints.length < 2 ? "📍 [비행기] 출발지와 도착지를 클릭하세요" : "✅ [비행기] 비행기 경로가 설정되었습니다")}
                  {activeMode === "report" && "🚨 [제보] 지도에 차량 위치를 좌클릭하세요!"}
                  <span className="text-[#F2A900] ml-2.5">(우클릭: 취소)</span>
                </div>
              )}
              {isHotDropOn && (
                <div className="bg-orange-600/20 backdrop-blur-md text-orange-200 px-5 py-2 rounded-full text-[11px] font-black border border-orange-500/30 shadow-[0_0_15px_rgba(234,88,12,0.2)] animate-in zoom-in-95 duration-500 flex items-center gap-2">
                  <Flame size={12} className="text-orange-400 animate-pulse fill-orange-400" />
                  <span className="uppercase tracking-tight">핫드랍: 상위 랭커 및 최근 경쟁 매치 기반 실시간 집계 중</span>
                </div>
              )}
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
            isHotDropOn={isHotDropOn}
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
