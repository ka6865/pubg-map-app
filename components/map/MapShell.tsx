import React, { memo, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import L from "leaflet";
import Sidebar from "../Sidebar";
import MobileBottomSheet from "./MobileBottomSheet";
import MapView from "./MapView";
import { X, Hammer, Map as MapIcon, Crosshair, Plane, AlertCircle, SlidersHorizontal, Menu, Flame, Grid, MapPin, Target } from 'lucide-react';
import type { MapTab, MapMarker, AuthUser, PendingVehicle } from "../../types/map";
import { useTelemetry } from "../../hooks/useTelemetry";
import TelemetryPlayer from "./TelemetryPlayer";
import KillFeed from "./KillFeed";
import ZoneTimer from "./ZoneTimer";
import HomeNotice from "./HomeNotice";
import { TelemetrySidebar } from "./telemetry/TelemetrySidebar";
import { SimulatorPanel } from "./SimulatorPanel";
import { HeatmapLegend } from "./HeatmapLegend";

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

const getDistanceToLineSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
  const A = px - x1; const B = py - y1; const C = x2 - x1; const D = y2 - y1;
  const dot = A * C + B * D; const lenSq = C * C + D * D;
  const param = lenSq !== 0 ? dot / lenSq : -1;
  let xx, yy;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }
  const dx = px - xx; const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
};

const formatTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
};

const MapShell = memo(({
    activeMapId, currentMap, bounds, visibleVehicles, icons, imageHeight, imageWidth,
    isMobile, isSidebarOpen, filters, onSetSidebarOpen, onToggleFilter, onGetCount,
    onEnableDefaultVehicleFilters, currentUser, isAdmin, pendingVehicles,
  }: MapShellProps) => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const playbackId = searchParams?.get("playback") || null;
    const playbackNickname = searchParams?.get("nickname") || null;
    
    const {
      events: telemetryEvents, loading: telemetryLoading, error: telemetryError,
      isPlaying, setIsPlaying, playbackSpeed, setPlaybackSpeed,
      currentTimeMs, setCurrentTimeMs, maxTimeMs, currentStates, teamNames, zoneEvents,
      isFullMode, fetchTelemetry
    } = useTelemetry(playbackId, playbackNickname, activeMapId);

    const [activeMode, setActiveMode] = useState<"none" | "mortar" | "flight" | "report" | "simulate">("none");
    const [mortarPoints, setMortarPoints] = useState<L.LatLng[]>([]);
    const [flightPoints, setFlightPoints] = useState<L.LatLng[]>([]);
    const [reportLocation, setReportLocation] = useState<L.LatLng | null>(null);

    // 시뮬레이터 전용 상태 추가
    const [simulatorStep, setSimulatorStep] = useState(0);
    const [simulatorPhases, setSimulatorPhases] = useState<L.LatLng[]>([]);
    const [isVehicleFilterOn, setIsVehicleFilterOn] = useState(false);
    const [isGridOn, setIsGridOn] = useState(true);
    const [isHotDropOn, setIsHotDropOn] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showZone, setShowZone] = useState(true);
    const [showCombatDots, setShowCombatDots] = useState(false);
    const [showShotDots, setShowShotDots] = useState(true);
    const [hiddenPlayers, setHiddenPlayers] = useState<string[]>([]);
    const [showPlayerNames, setShowPlayerNames] = useState(true);
    const [showSmokeNotice, setShowSmokeNotice] = useState(false); // 🎯 연막탄 공지 상태

    // 🎯 "오늘 하루 보지 않기" 체크 로직
    useEffect(() => {
      let isMounted = true;
      if (playbackId && isFullMode) {
        const dismissed = localStorage.getItem("smoke_notice_dismissed");
        const today = new Date().toDateString();
        if (dismissed !== today && isMounted) {
          setTimeout(() => setShowSmokeNotice(true), 0);
        }
      } else {
        if (isMounted) setTimeout(() => setShowSmokeNotice(false), 0);
      }
      return () => { isMounted = false; };
    }, [playbackId, isFullMode]);

    const handleDismissNotice = (dontShowToday: boolean) => {
      if (dontShowToday) {
        localStorage.setItem("smoke_notice_dismissed", new Date().toDateString());
      }
      setShowSmokeNotice(false);
    };

    const mapScale = 8192 / imageWidth;
    const pxPerMeter = imageWidth / 8192;

    const handleModeToggle = (mode: "mortar" | "flight" | "report" | "simulate") => {
      setActiveMode(activeMode === mode ? "none" : mode);
      setMortarPoints([]); 
      setFlightPoints([]); 
      setIsVehicleFilterOn(false); 
      setReportLocation(null);
      if (mode !== "simulate") {
        setSimulatorStep(0);
        setSimulatorPhases([]);
      }
    };

    let flightPolygonCoords: [number, number][] = [];
    if (flightPoints.length === 2) {
      const p1 = flightPoints[0]; const p2 = flightPoints[1];
      const radiusPx = 1000 * pxPerMeter; const dx = p2.lng - p1.lng; const dy = p2.lat - p1.lat;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        const nx = -dy / len; const ny = dx / len;
        flightPolygonCoords = [
          [p1.lat + ny * radiusPx, p1.lng + nx * radiusPx],
          [p2.lat + ny * radiusPx, p2.lng + nx * radiusPx],
          [p2.lat - ny * radiusPx, p2.lng - nx * radiusPx],
          [p1.lat - ny * radiusPx, p1.lng - nx * radiusPx],
        ];
      }
    }

    let displayedVehicles = visibleVehicles;
    if ((activeMode === "flight" || activeMode === "simulate") && flightPoints.length === 2 && isVehicleFilterOn) {
      displayedVehicles = visibleVehicles.filter((v) => {
        const distPx = getDistanceToLineSegment(v.x, v.y, flightPoints[0].lng, flightPoints[0].lat, flightPoints[1].lng, flightPoints[1].lat);
        return distPx <= 1000 && !(v.type === "Key" || v.type === "SecretRoom" || v.type === "SecurityCard");
      });
    }

    return (
      <div className="flex w-full h-full overflow-hidden">
        {!isMobile ? (
          <Sidebar isOpen={isSidebarOpen} setIsOpen={onSetSidebarOpen} mapLabel={currentMap?.label || "지도"} activeMapId={activeMapId} filters={filters} toggleFilter={onToggleFilter} getCount={onGetCount} />
        ) : (
          <MobileBottomSheet isOpen={isSidebarOpen} setIsOpen={onSetSidebarOpen} mapLabel={currentMap?.label || "지도"} activeMapId={activeMapId} filters={filters} toggleFilter={onToggleFilter} getCount={onGetCount} />
        )}

        <div className="flex-1 flex overflow-hidden relative bg-[#0a0a0a]">
          {/* Left: Map Area */}
          <div className="flex-1 flex flex-col relative min-w-0">
            <HomeNotice />

            {/* 구형 상태바 제거됨 */}

            {/* UI Overlay Buttons */}
            {!playbackId && (
              <div className={`absolute z-[1000] flex w-full pointer-events-none transition-all ${isMobile ? 'bottom-[72px] px-6 safe-bottom' : 'top-4 right-4 justify-end'}`}>
                <div className={`flex w-full items-start ${isMobile ? 'justify-between items-end' : 'justify-end'}`}>
                  {!isMobile && !isSidebarOpen && (
                    <button onClick={() => onSetSidebarOpen(true)} className="pointer-events-auto absolute left-4 top-0 flex items-center justify-center w-[44px] h-[44px] bg-black/80 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl active:scale-90 transition-all text-white hover:text-[#F2A900] z-[5000]">
                      <Menu size={22} strokeWidth={2.5} />
                    </button>
                  )}
                  {isMobile && (
                    <button onClick={() => onSetSidebarOpen(!isSidebarOpen)} className="pointer-events-auto flex items-center justify-center w-[52px] h-[52px] bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl active:scale-90 transition-all text-[#F2A900]">
                      <SlidersHorizontal size={22} strokeWidth={2.5} />
                    </button>
                  )}
                  <div className="flex flex-col gap-3 items-end pointer-events-auto">
                    <button onClick={() => setIsMenuOpen(!isMenuOpen)} className={`pointer-events-auto flex items-center gap-2 px-6 shadow-[0_12px_40px_rgba(0,0,0,0.4)] active:scale-90 transition-all duration-300 border border-white/5 ${isMenuOpen ? "bg-red-600 text-white h-[52px] rounded-2xl text-sm" : "bg-black/80 backdrop-blur-xl text-[#F2A900] h-[52px] rounded-2xl text-base"}`}>
                      {isMenuOpen ? <><X size={18} strokeWidth={3} /><span className="font-black uppercase tracking-tight text-xs">닫기</span></> : <><Hammer size={18} strokeWidth={3} /><span className="font-black uppercase tracking-tight text-xs">{isMobile ? "도구" : "지도 도구"}</span></>}
                    </button>
                    {isMenuOpen && (
                      <div className="flex flex-col gap-2.5 items-end animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <button onClick={() => setIsHotDropOn(!isHotDropOn)} className={`pointer-events-auto flex items-center gap-2.5 px-5 py-3.5 border border-white/10 rounded-xl font-black text-xs shadow-2xl transition-all active:scale-95 ${isHotDropOn ? "bg-gradient-to-r from-orange-500 to-red-600 text-white border-orange-400" : "bg-[#1a1a1a] text-orange-500 hover:text-orange-400"}`}><Flame size={16} strokeWidth={3} /><span className="uppercase tracking-tighter">핫드랍 {isHotDropOn ? "ON" : "OFF"}</span></button>
                        <button onClick={() => setIsGridOn(!isGridOn)} className={`pointer-events-auto flex items-center gap-2.5 px-5 py-3.5 border border-white/10 rounded-xl font-black text-xs shadow-2xl transition-all active:scale-95 ${isGridOn ? "bg-[#F2A900] text-black" : "bg-[#1a1a1a] text-[#777]"}`}><MapIcon size={16} strokeWidth={3} /><span className="uppercase tracking-tighter">그리드 {isGridOn ? "ON" : "OFF"}</span></button>
                        <button onClick={() => handleModeToggle("simulate")} className={`pointer-events-auto flex items-center gap-2.5 px-5 py-3.5 border border-blue-500/30 rounded-xl font-black text-xs shadow-2xl transition-all active:scale-95 ${activeMode === "simulate" ? "bg-blue-600 text-white" : "bg-[#1a1a1a] text-blue-400 hover:text-blue-300"}`}><Target size={16} strokeWidth={3} /><span className="uppercase tracking-tighter">시뮬레이터</span></button>
                        <button onClick={() => handleModeToggle("mortar")} className={`pointer-events-auto flex items-center gap-2.5 px-5 py-3.5 border border-white/10 rounded-xl font-black text-xs shadow-2xl transition-all active:scale-95 ${activeMode === "mortar" ? "bg-[#ea4335] text-white" : "bg-[#1a1a1a] text-[#777]"}`}><Crosshair size={16} strokeWidth={3} /><span className="uppercase tracking-tighter">박격포</span></button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            <SimulatorPanel 
              activeMode={activeMode}
              currentStep={simulatorStep}
              flightPointsReady={flightPoints.length === 2}
              onNextStep={() => setSimulatorStep(s => s + 1)}
              onPrevStep={() => {
                setSimulatorStep(s => {
                  const nextStep = Math.max(0, s - 1);
                  setSimulatorPhases(prev => prev.slice(0, Math.max(0, nextStep - 1)));
                  return nextStep;
                });
              }}
              onClose={() => handleModeToggle("simulate")}
              onReset={() => {
                setFlightPoints([]);
                setSimulatorStep(0);
                setSimulatorPhases([]);
                setIsVehicleFilterOn(false);
              }}
              isVehicleFilterOn={isVehicleFilterOn}
              setIsVehicleFilterOn={setIsVehicleFilterOn}
              simulatorPhases={simulatorPhases}
            />

            <MapView
              activeMapId={activeMapId} currentMap={currentMap} bounds={bounds} icons={icons} imageHeight={imageHeight} imageWidth={imageWidth}
              activeMode={activeMode} mortarPoints={mortarPoints} flightPoints={flightPoints} flightPolygonCoords={flightPolygonCoords}
              displayedVehicles={displayedVehicles} isGridOn={isGridOn} mapScale={mapScale} setMortarPoints={setMortarPoints}
              setFlightPoints={setFlightPoints} setIsVehicleFilterOn={setIsVehicleFilterOn} setActiveMode={setActiveMode}
              setReportLocation={setReportLocation} reportLocation={reportLocation} currentUser={currentUser} isAdmin={isAdmin}
              pendingVehicles={playbackId ? [] : pendingVehicles} filters={filters} isHotDropOn={isHotDropOn}
              isHighPrecision={isFullMode}
              telemetryData={{
                isActive: !!playbackId, mapName: activeMapId || "Erangel", events: telemetryEvents, currentTimeMs, currentStates,
                teamNames, zoneEvents, showZone, showCombatDots, showShotDots, hiddenPlayers, showPlayerNames,
              }}
              simulatorStep={simulatorStep}
              simulatorPhases={simulatorPhases}
              setSimulatorStep={setSimulatorStep}
              setSimulatorPhases={setSimulatorPhases}
            />

            {/* 🏆 히트맵 범례 (핫드랍 또는 시뮬레이터 활성화 시) */}
            <HeatmapLegend 
              visible={isHotDropOn} 
              type="hotdrop" 
            />

            {playbackId && (
              <>
                {/* 🏆 고도화된 통합 상단 상태바 (모바일 최적화) */}
                <div className={`absolute ${isMobile ? 'top-2' : 'top-6'} left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-2 w-full max-w-xl pointer-events-none`}>
                  {/* ℹ️ 연막탄 위치 추론 안내 공지 (모바일에서는 더 작게) */}
                  {showSmokeNotice && (
                    <div className={`pointer-events-auto bg-black/90 backdrop-blur-xl ${isMobile ? 'px-3 py-1.5 mx-4' : 'px-4 py-2'} rounded-xl border border-orange-500/30 shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex items-center gap-3 mb-2 animate-in fade-in slide-in-from-top-2 duration-500`}>
                      <AlertCircle size={isMobile ? 12 : 14} className="text-orange-500 shrink-0" />
                      <div className="flex flex-col">
                        <span className={`${isMobile ? 'text-[9px]' : 'text-[11px]'} text-white font-bold tracking-tight`}>
                          고정밀 분석: 연막탄 위치는 투척 궤적 기반의 추론 데이터입니다.
                        </span>
                        <div className="flex gap-3 mt-1">
                          <button onClick={() => handleDismissNotice(false)} className="text-[10px] text-gray-400">닫기</button>
                          <button onClick={() => handleDismissNotice(true)} className="text-[10px] text-orange-500/80 font-bold">오늘 안보기</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {zoneEvents.length > 0 && (
                    <div className={`bg-black/80 backdrop-blur-md ${isMobile ? 'px-3 py-0.5' : 'px-4 py-1'} rounded-full border border-white/10 shadow-2xl flex items-center gap-3 animate-fade-in`}>
                       <ZoneStatus currentTimeMs={currentTimeMs} zoneEvents={zoneEvents} />
                    </div>
                  )}
                  
                  <div className={`bg-[#111]/90 backdrop-blur-xl ${isMobile ? 'px-5 py-2' : 'px-8 py-3'} rounded-[2rem] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center ${isMobile ? 'gap-4' : 'gap-8'}`}>
                    <div className="flex flex-col items-center">
                      <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Time</span>
                      <span className={`${isMobile ? 'text-lg' : 'text-2xl'} font-mono font-bold text-white leading-none`}>{formatTime(currentTimeMs)}</span>
                    </div>
                    <div className="w-px h-6 bg-white/10" />
                    <div className="flex flex-col items-center">
                      <span className="text-[9px] text-[#F2A900] font-bold uppercase tracking-widest">Alive</span>
                      <span className={`${isMobile ? 'text-lg' : 'text-2xl'} font-mono font-bold text-[#F2A900] leading-none`}>
                        {Object.values(currentStates || {}).filter((p: any) => !p.isDead).length}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 🚀 데이터 로딩 오버레이 */}
                {telemetryLoading && (
                  <div className="absolute inset-0 z-[5000] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center">
                    <div className="relative">
                      <div className={`w-20 h-20 border-4 ${isFullMode ? 'border-yellow-500/20 border-t-yellow-500' : 'border-indigo-500/20 border-t-indigo-500'} rounded-full animate-spin`} />
                      <div className="absolute inset-0 flex items-center justify-center text-2xl animate-pulse">
                        {isFullMode ? '💎' : '📊'}
                      </div>
                    </div>
                    <h3 className="mt-6 text-white font-black text-xl tracking-tighter uppercase px-4 text-center">
                      {isFullMode ? "초정밀 데이터 분석 중..." : "전투 데이터 복기 중..."}
                    </h3>
                  </div>
                )}

                {/* 모바일용 팀 리스트 토글 버튼 */}
                {isMobile && (
                  <button 
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="absolute top-4 right-4 z-[2000] pointer-events-auto flex items-center justify-center w-[44px] h-[44px] bg-black/80 backdrop-blur-md border border-white/10 rounded-xl text-[#F2A900]"
                  >
                    <Menu size={20} />
                  </button>
                )}

                {/* 하단 플레이어 컨트롤러 */}
                <div className={`absolute ${isMobile ? 'bottom-20' : 'bottom-6'} left-1/2 -translate-x-1/2 z-[1000] w-full max-w-2xl px-4`}>
                  <TelemetryPlayer
                    events={telemetryEvents} teamNames={teamNames} isPlaying={isPlaying} setIsPlaying={setIsPlaying} playbackSpeed={playbackSpeed}
                    setPlaybackSpeed={setPlaybackSpeed} currentTimeMs={currentTimeMs} setCurrentTimeMs={setCurrentTimeMs}
                    maxTimeMs={maxTimeMs} loading={telemetryLoading} error={telemetryError} showZone={showZone}
                    onToggleZone={() => setShowZone(!showZone)} showCombatDots={showCombatDots}
                    onToggleCombatDots={() => setShowCombatDots(!showCombatDots)} showShotDots={showShotDots}
                    onToggleShotDots={() => setShowShotDots(!showShotDots)} hiddenPlayers={hiddenPlayers}
                    onTogglePlayer={(n) => setHiddenPlayers(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n])}
                    showPlayerNames={showPlayerNames} onTogglePlayerNames={() => setShowPlayerNames(!showPlayerNames)}
                    onClose={() => { const p = new URLSearchParams(searchParams?.toString() || ""); p.delete("playback"); p.delete("nickname"); router.push(`/?${p.toString()}`); }}
                  />
                </div>
                {telemetryEvents.length > 0 && (
                  <div className={isMobile ? "translate-y-[-60px]" : ""}>
                    <KillFeed events={telemetryEvents} currentTimeMs={currentTimeMs} teamNames={teamNames} playbackSpeed={playbackSpeed} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right Sidebar (모바일에서는 오버레이 형태로 전환) */}
          {playbackId && (
            <div className={`
              ${isMobile 
                ? `absolute inset-y-0 right-0 z-[3000] transition-transform duration-300 ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}` 
                : 'relative'
              }
            `}>
              {isMobile && isMenuOpen && (
                <div 
                  className="absolute inset-0 -left-full bg-black/40 backdrop-blur-sm z-[-1]"
                  onClick={() => setIsMenuOpen(false)}
                />
              )}
              <TelemetrySidebar currentStates={currentStates} teamNames={teamNames} />
            </div>
          )}
        </div>
      </div>
    );
});

MapShell.displayName = "MapShell";

const ZoneStatus = ({ currentTimeMs, zoneEvents }: { currentTimeMs: number, zoneEvents: any[] }) => {
  const currentZone = zoneEvents.find(z => z.relativeTimeMs > currentTimeMs) || zoneEvents[zoneEvents.length - 1];
  if (!currentZone) return null;
  
  const isMoving = currentZone.isMoving;
  const remainingSec = Math.max(0, Math.floor((currentZone.relativeTimeMs - currentTimeMs) / 1000));
  const m = Math.floor(remainingSec / 60);
  const s = remainingSec % 60;
  const timeStr = `${m}:${s.toString().padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${isMoving ? "bg-blue-500 animate-pulse" : "bg-white/40"}`} />
      <span className="text-[11px] font-bold text-gray-300">
        {isMoving ? "자기장 이동 중" : `자기장 대기 (${currentZone.phase}단계)`}
      </span>
      <span className="text-[11px] font-mono font-bold text-[#F2A900] ml-1">
        {timeStr}
      </span>
    </div>
  );
};

export default MapShell;
