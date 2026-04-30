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
    <div className="absolute sm:bottom-6 top-[250px] sm:top-auto sm:right-6 sm:left-auto left-4 right-auto z-[1000] bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-3 sm:p-4 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex flex-col gap-2.5">
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
