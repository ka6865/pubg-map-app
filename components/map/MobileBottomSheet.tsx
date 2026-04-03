'use client';

import React, { useEffect } from 'react';
import { CATEGORY_INFO, MAP_CATEGORIES } from "../../lib/map_config";
import { X, ChevronUp } from 'lucide-react';

interface MobileBottomSheetProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  mapLabel: string;
  activeMapId: string;
  filters: { [key: string]: boolean };
  toggleFilter: (id: string) => void;
  getCount: (id: string) => number;
}

export default function MobileBottomSheet({
  isOpen,
  setIsOpen,
  mapLabel,
  activeMapId,
  filters,
  toggleFilter,
  getCount,
}: MobileBottomSheetProps) {
  const currentCategories =
    MAP_CATEGORIES[activeMapId] || MAP_CATEGORIES["Erangel"];

  // Handle body scroll lock when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return (
    <button 
      onClick={() => setIsOpen(true)}
      className="fixed bottom-20 left-4 z-[4000] bg-[#F2A900] text-black px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 md:hidden"
    >
      <ChevronUp size={20} />
      필터 보기
    </button>
  );

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 z-[5000] md:hidden transition-opacity"
        onClick={() => setIsOpen(false)}
      />
      
      {/* Sheet */}
      <div 
        className="fixed bottom-0 left-0 right-0 z-[5001] bg-[#121212] border-t border-[#333] rounded-t-3xl md:hidden flex flex-col max-h-[90vh] transition-transform animate-in slide-in-from-bottom duration-300 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
      >
        {/* Handle / Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#222]">
          <div className="w-12 h-1.5 bg-[#333] rounded-full absolute top-2 left-1/2 -translate-x-1/2" />
          <h2 className="text-[#F2A900] font-black text-xl italic tracking-tighter uppercase">
            {mapLabel} 필터
          </h2>
          <button onClick={() => setIsOpen(false)} className="p-1 bg-[#222] rounded-full text-[#666]">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-5 pb-10 pt-4">
          {/* Existing Filters UI */}
          <div
            onClick={() => toggleFilter("pending")}
            className={`flex items-center justify-between p-4 my-2 rounded-2xl transition-all border-l-4 ${
                filters["pending"] ? "bg-[#3b2f15] border-[#F2A900]" : "bg-[#1a1a1a] border-transparent"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">👀</span>
              <span className={`text-sm ${filters["pending"] ? "text-[#F2A900] font-black" : "text-[#777]"}`}>
                제보 진행 중인 구역
              </span>
            </div>
            <span className={`text-[10px] font-black px-2 py-1 rounded bg-black/40 ${filters["pending"] ? "text-[#F2A900]" : "text-[#666]"}`}>
              {filters["pending"] ? "ON" : "OFF"}
            </span>
          </div>

          <div className="h-[1px] bg-[#333] my-4 mx-2" />

          <div className="grid grid-cols-2 gap-3 mt-2">
            {currentCategories.map((id) => {
              const item = CATEGORY_INFO[id];
              if (!item) return null;

              return (
                <div
                  key={id}
                  onClick={() => toggleFilter(id)}
                  className={`flex items-center gap-3 p-4 rounded-2xl transition-all border-l-4 ${
                    filters[id] ? "bg-[#252525]" : "bg-[#1a1a1a] border-transparent"
                  }`}
                  style={{ borderLeftColor: filters[id] ? item.color : 'transparent' }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill={filters[id] ? item.color : "#555"}
                  >
                    <path d={item.path} />
                  </svg>
                  <div className="flex flex-col">
                    <span className={`text-sm tracking-tight ${filters[id] ? "text-white font-black" : "text-[#777]"}`}>
                        {item.label}
                    </span>
                    <span className={`text-[10px] font-bold ${filters[id] ? "text-white/40" : "text-[#555]"}`}>
                        Count: {getCount(id)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
