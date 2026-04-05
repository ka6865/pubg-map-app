import React, { memo, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import L from "leaflet";
import Sidebar from "../Sidebar";
import MobileBottomSheet from "./MobileBottomSheet";
import MapView from "./MapView";
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
  pendingVehicles: PendingVehicle[]; // 🌟 추가
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

    // 🌟 텔레메트리 관련 쿼리 파라미터 확인 및 상태 가져오기
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
    const [showCombatDots, setShowCombatDots] = useState(false);  // 교전 흐적 점 (default OFF)
    const [showShotDots, setShowShotDots] = useState(true);      // 아군 발사 위치 점 (default ON)
    const [hiddenPlayers, setHiddenPlayers] = useState<string[]>([]); // 숨겨진 플레이어 목록
    const [showPlayerNames, setShowPlayerNames] = useState(true); // 플레이어 이름 표시 여부
    const [showPlayerPaths, setShowPlayerPaths] = useState(true); // 플레이어 이동 경로 표시 여부

    useEffect(() => {
      // 컴포넌트 마운트/업데이트 초기화 관련 로직 (의도적으로 상위에서 제어)
      // 또는 activeMapId 변경 시 꼭 필요한 side effect만 수행
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

        <div className="relative flex-1 h-full">
          <HomeNotice />
          <div className={`absolute z-[1000] flex flex-col gap-[10px] items-end ${isMobile ? 'bottom-[80px] right-[10px]' : 'top-[15px] right-[15px]'}`}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`px-4 text-white border border-[#444] rounded-lg font-bold cursor-pointer shadow-[0_4px_10px_rgba(0,0,0,0.6)] transition-all duration-200 ease-in-out ${isMenuOpen ? "bg-[#d93025]" : "bg-[#252525]"} ${isMobile ? "py-4 text-lg" : "py-2"}`}
            >
              {isMenuOpen ? "✖ 메뉴 닫기" : "🛠️ 지도 도구"}
            </button>

            {isMenuOpen && (
              <div className="flex flex-col gap-[10px] items-end">
                <button
                  onClick={() => setIsGridOn(!isGridOn)}
                  className={`px-4 py-2 border border-[#333] rounded-lg font-bold cursor-pointer shadow-[0_4px_10px_rgba(0,0,0,0.5)] ${isGridOn ? "bg-[#F2A900] text-black" : "bg-[#1a1a1a] text-[#aaa]"}`}
                >
                  🗺️ 그리드망 {isGridOn ? "ON" : "OFF"}
                </button>
                <button
                  onClick={() => handleModeToggle("mortar")}
                  className={`px-4 py-2 border border-[#333] rounded-lg font-bold cursor-pointer shadow-[0_4px_10px_rgba(0,0,0,0.5)] ${activeMode === "mortar" ? "bg-[#ea4335] text-white" : "bg-[#1a1a1a] text-[#aaa]"}`}
                >
                  🎯 박격포 계산기
                </button>
                <button
                  onClick={() => handleModeToggle("flight")}
                  className={`px-4 py-2 border border-[#333] rounded-lg font-bold cursor-pointer shadow-[0_4px_10px_rgba(0,0,0,0.5)] ${activeMode === "flight" ? "bg-[#3b82f6] text-white" : "bg-[#1a1a1a] text-[#aaa]"}`}
                >
                  ✈️ 비행기 경로 (Drop Zone)
                </button>
                <button
                  onClick={() => handleModeToggle("report")}
                  className={`px-4 py-2 border border-[#333] rounded-lg font-bold cursor-pointer shadow-[0_4px_10px_rgba(0,0,0,0.5)] ${activeMode === "report" ? "bg-[#10b981] text-white" : "bg-[#1a1a1a] text-[#aaa]"}`}
                >
                  📣 차량 제보 모드
                </button>
                {activeMode === "flight" && flightPoints.length === 2 && (
                  <button
                    onClick={() => {
                      const nextState = !isVehicleFilterOn;
                      setIsVehicleFilterOn(nextState);
                      if (nextState && onEnableDefaultVehicleFilters)
                        onEnableDefaultVehicleFilters();
                    }}
                    className={`px-3 py-2 border-none rounded-[20px] font-black text-[12px] cursor-pointer ${isVehicleFilterOn ? "bg-[#F2A900] text-black" : "bg-[#252525] text-[#888]"}`}
                  >
                    🚗 주변 1km 차량/보트 찾기 {isVehicleFilterOn ? "ON" : "OFF"}
                  </button>
                )}
              </div>
            )}
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
            pendingVehicles={playbackId ? [] : pendingVehicles} // 🌟 넘겨주기
            filters={filters} // 🌟 사이드바 토글 상태 체크용
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

          {/* 🌟 텔레메트리 재생 컨트롤러 렌더링 */}
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

          {/* 🔫 실시간 킬로그 피드 (우측 상단 오버레이) */}
          {playbackId && telemetryEvents.length > 0 && (
            <KillFeed
              events={telemetryEvents}
              currentTimeMs={currentTimeMs}
              teamNames={teamNames}
              playbackSpeed={playbackSpeed}
            />
          )}

          {/* 🔵 자기장 타이머 (상단 중앙) */}
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
