import React, { useState, useRef, useEffect } from 'react';
import { Plane, ArrowRight, Undo2, MousePointer2, Minus, Maximize2, Car, X, RotateCcw } from 'lucide-react';

interface SimulatorPanelProps {
  activeMode: string;
  currentStep: number;
  flightPointsReady: boolean;
  onNextStep: () => void;
  onPrevStep: () => void;
  onClose: () => void;
  isVehicleFilterOn?: boolean;
  setIsVehicleFilterOn?: (on: boolean) => void;
  onReset: () => void;
  simulatorPhases?: any[];
}

export function SimulatorPanel({ 
  activeMode, 
  currentStep, 
  flightPointsReady,
  onNextStep, 
  onPrevStep, 
  onClose,
  isVehicleFilterOn,
  setIsVehicleFilterOn,
  onReset,
  simulatorPhases = []
}: SimulatorPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartPos.current = { x: clientX - position.x, y: clientY - position.y };
  };

  const handleDrag = (e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setPosition({
      x: clientX - dragStartPos.current.x,
      y: clientY - dragStartPos.current.y
    });
  };

  const handleDragEnd = () => setIsDragging(false);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDrag);
      window.addEventListener('touchend', handleDragEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleDrag);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDrag);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging]);

  if (activeMode !== "simulate") return null;

  if (isMinimized) {
    return (
      <div 
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        className={`fixed sm:bottom-[140px] sm:top-auto top-[74px] left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0 z-[2000] flex items-center gap-3 bg-black/80 backdrop-blur-3xl border border-blue-500/30 rounded-full px-5 py-2.5 shadow-[0_10px_30px_rgba(59,130,246,0.2)] animate-in fade-in zoom-in-95 duration-300 pointer-events-auto ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        <div className="flex items-center gap-2 select-none">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
          <span className="text-white font-black text-[11px] uppercase tracking-[0.1em] whitespace-nowrap">시뮬레이터 활성 중</span>
        </div>
        <div className="h-3 w-[1px] bg-white/10 mx-1" />
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setIsMinimized(false);
          }}
          className="flex items-center gap-1.5 text-blue-400 font-bold text-[10px] hover:text-white transition-colors whitespace-nowrap"
        >
          <Maximize2 size={12} /> 펼치기
        </button>
      </div>
    );
  }

  return (
    <div 
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      className="fixed sm:bottom-[140px] sm:top-auto top-24 sm:right-6 right-4 sm:left-auto left-4 sm:translate-x-0 z-[2000] sm:w-72 bg-black/90 backdrop-blur-3xl border border-white/10 rounded-[2rem] p-4 sm:p-5 shadow-[0_25px_60px_rgba(0,0,0,0.6)] flex flex-col gap-4 animate-in fade-in slide-in-from-top-4 duration-500 pointer-events-auto"
    >
      
      <div 
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        className={`flex justify-between items-center px-1 select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        <div className="flex flex-col">
          <h3 className="text-white font-black text-[13px] flex items-center gap-2 tracking-tight">
            <Plane size={16} className="text-blue-500" /> BLUEZONE SIMULATOR
          </h3>
          <span className="text-[9px] text-white/30 font-bold uppercase tracking-widest mt-0.5">Tactical Analysis Engine</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onReset} className="p-2 text-white/40 hover:text-orange-400 transition-colors" title="초기화"><RotateCcw size={16} /></button>
          <button onClick={() => setIsMinimized(true)} className="p-2 text-white/40 hover:text-white transition-colors" title="축소"><Minus size={16} /></button>
          <button onClick={onClose} className="p-2 text-white/40 hover:text-red-500 transition-colors" title="닫기"><X size={16} /></button>
        </div>
      </div>

      <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="flex flex-col gap-3">
        {/* Step Indicator */}
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-tighter text-gray-500">
          <div className={`flex flex-col items-center gap-1 ${currentStep === 0 ? "text-blue-400" : ""}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 ${currentStep === 0 ? "border-blue-500 bg-blue-500/20" : "border-white/10"}`}>P</div>
            <span>비행기</span>
          </div>
          <ArrowRight size={10} />
          <div className={`flex flex-col items-center gap-1 ${currentStep === 1 ? "text-orange-400" : ""}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 ${currentStep === 1 ? "border-orange-500 bg-orange-500/20" : "border-white/10"}`}>1</div>
            <span>1페이즈</span>
          </div>
          <ArrowRight size={10} />
          <div className={`flex flex-col items-center gap-1 ${currentStep >= 2 ? "text-red-400" : ""}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 ${currentStep >= 2 ? "border-red-500 bg-red-500/20" : "border-white/10"}`}>N</div>
            <span>{currentStep >= 2 ? `${currentStep}P` : "N페이즈"}</span>
          </div>
        </div>

        {/* Current Instruction */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-2xl blur opacity-30 transition duration-1000 group-hover:opacity-100" />
          <div className="relative bg-[#0a0a0a]/60 backdrop-blur-md border border-white/5 rounded-2xl p-4">
            <p className="text-[11px] text-gray-300 flex items-start gap-3 leading-relaxed font-medium">
              <MousePointer2 size={14} className="text-blue-500 shrink-0 mt-0.5" />
              <span>
                {currentStep === 0 && !flightPointsReady && "지도에 두 점을 찍어 비행기 경로를 설정하세요."}
                {currentStep === 0 && flightPointsReady && "경로 설정 완료. 다음 페이즈로 이동하세요."}
                {currentStep > 0 && currentStep < 9 && `지도 위를 클릭하여 ${currentStep}페이즈 원을 배치하세요.`}
                {currentStep === 9 && "최종 페이즈입니다. 시뮬레이션이 완료되었습니다."}
              </span>
            </p>
          </div>
        </div>

        {/* Vehicle Filter Toggle (0단계에서만 표시) */}
        {currentStep === 0 && setIsVehicleFilterOn && (
          <button 
            onClick={() => setIsVehicleFilterOn(!isVehicleFilterOn)}
            className={`flex items-center justify-between px-4 py-3 rounded-2xl border transition-all ${
              isVehicleFilterOn 
              ? "bg-blue-600/20 border-blue-500/50 text-blue-400" 
              : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
            }`}
          >
            <div className="flex items-center gap-2.5 text-[11px] font-bold">
              <Car size={14} /> 주변 1km 차량 필터링
            </div>
            <div className={`w-8 h-4 rounded-full relative transition-colors ${isVehicleFilterOn ? "bg-blue-600" : "bg-gray-700"}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isVehicleFilterOn ? "left-4.5" : "left-0.5"}`} />
            </div>
          </button>
        )}

        {/* Controls */}
        <div className="flex gap-2.5 mt-2">
          <button 
            onClick={onPrevStep}
            disabled={currentStep === 0}
            className="flex-1 bg-white/5 hover:bg-white/10 disabled:opacity-20 text-white/70 text-[11px] font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all border border-white/5"
          >
            <Undo2 size={14} /> 이전
          </button>
          
          <button 
            onClick={onNextStep}
            disabled={
              (currentStep === 0 && !flightPointsReady) || 
              (currentStep > 0 && simulatorPhases.length < currentStep) ||
              (currentStep >= 9)
            }
            className={`flex-[2] bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-20 disabled:grayscale text-white text-[11px] font-black py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-[0_10px_20px_rgba(37,99,235,0.3)] ${
              (currentStep === 0 && flightPointsReady) || (currentStep > 0 && simulatorPhases.length === currentStep) ? "animate-pulse ring-2 ring-blue-500/50" : ""
            }`}
          >
            {currentStep >= 9 ? "마지막 단계" : "다음 단계"} <ArrowRight size={14} />
          </button>
        </div>

        {/* Matched Count Info */}
        {currentStep > 0 && (
          <div className="flex items-center justify-between px-2 text-[10px] font-bold">
            <span className="text-white/40">매칭된 매치 수</span>
            <span className="text-blue-400">{simulatorPhases.length > 0 ? "100+" : "0"} matches</span>
          </div>
        )}

        {/* Integrated Slim Legend for Probability */}
        {currentStep > 0 && (
          <div className="mt-2 pt-3 border-t border-white/5">
            <div className="flex justify-between items-center mb-2 px-1">
              <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.15em]">Formation Probability</span>
              <div className="flex items-center gap-3 text-[9px] font-bold">
                <span className="text-blue-500">Low</span>
                <span className="text-red-500">High</span>
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
              <div className="h-full w-full bg-gradient-to-r from-blue-600 via-green-500 to-red-600 opacity-80" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
