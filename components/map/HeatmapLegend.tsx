"use client";

import React from "react";

interface HeatmapLegendProps {
  visible: boolean;
  type: "hotdrop" | "bluezone";
}

export const HeatmapLegend: React.FC<HeatmapLegendProps> = ({ visible, type }) => {
  if (!visible) return null;

  const title = type === "hotdrop" ? "인구 밀집도 (Hot Drop)" : "자기장 형성 확률 (Probability)";
  
  return (
    <div className="absolute sm:bottom-6 sm:top-auto sm:right-6 sm:left-auto top-12 left-4 right-auto z-[1000] bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-2.5 sm:p-4 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
      {/* Mobile view: horizontal compact layout */}
      <div className="flex sm:hidden items-center gap-2.5 text-[10px]">
        <span className="font-bold text-[#F2A900] tracking-tight shrink-0">
          {type === "hotdrop" ? "핫드랍" : "자기장 확률"}
        </span>
        <div className="w-px h-3 bg-white/20 shrink-0" />
        <span className="text-gray-400 shrink-0">낮음</span>
        <div className="relative w-24 h-1.5 rounded-full overflow-hidden bg-white/5 shrink-0">
          <div 
            className="absolute inset-0 w-full h-full"
            style={{
              background: "linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)"
            }}
          />
        </div>
        <span className="text-gray-400 shrink-0">높음</span>
      </div>

      {/* Desktop view: standard layout */}
      <div className="hidden sm:flex flex-col gap-2.5">
        <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
          {title}
        </span>
        
        <div className="relative w-full sm:w-48 h-2 rounded-full overflow-hidden bg-white/5">
          <div 
            className="absolute inset-0 w-full h-full"
            style={{
              background: "linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)"
            }}
          />
        </div>
        
        <div className="flex justify-between items-center text-[11px] font-medium text-gray-300">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            <span>낮음 (Low)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>높음 (High)</span>
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
          </div>
        </div>
      </div>
    </div>
  );
};
