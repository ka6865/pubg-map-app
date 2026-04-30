"use client";

import React, { useState } from "react";
import { ShieldAlert, Zap, ArrowUpCircle, Users, HelpCircle } from "lucide-react";

interface IsolationData {
  isolationIndex: number;
  minDist: number;
  heightDiff: number;
  isCrossfire: boolean;
  teammateCount: number;
}

interface IsolationRadarProps {
  data: IsolationData | null;
  loading?: boolean;
}

export const IsolationRadar = ({ data, loading }: IsolationRadarProps) => {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  if (loading) return null; // 부모에서 Skeleton 처리

  if (!data) return null;

  // 정규화 (0-100)
  const normIsolation = Math.max(0, 100 - (data.isolationIndex * 30));
  const normDist = Math.max(0, 100 - (data.minDist / 2));
  const normHeight = Math.max(0, 100 - (data.heightDiff * 5));
  const normPressure = data.isCrossfire ? 20 : 90;

  const stats = [
    { 
      label: "공간 안정성", 
      value: normIsolation, 
      icon: <Users size={14} />, 
      color: "text-emerald-400", 
      desc: "점유 중인 위치의 전술적 안전도",
      formula: "100 - (고립 지수 * 30)",
      detail: "고립 지수 = (아군 거리 / 적군 거리). 1.0 이하면 매우 안전한 포지셔닝입니다."
    },
    { 
      label: "교전 지원 가능성", 
      value: normDist, 
      icon: <Zap size={14} />, 
      color: "text-blue-400", 
      desc: "팀원과의 즉각적인 교전 지원 거리 유지",
      formula: "100 - (평균 아군 거리 / 2)",
      detail: "아군과 200m 이상 떨어지면 0점 처리됩니다. 백업 가능한 거리를 유지하세요."
    },
    { 
      label: "고도 일치성", 
      value: normHeight, 
      icon: <ArrowUpCircle size={14} />, 
      color: "text-purple-400", 
      desc: "팀원과 동일한 수직 높이 유지",
      formula: "100 - (평균 고도차 * 5)",
      detail: "수직 높이차가 20m를 넘으면 0점 처리됩니다. 복층/지형 고저차를 관리하세요."
    },
    { 
      label: "교전 분산도", 
      value: normPressure, 
      icon: <ShieldAlert size={14} />, 
      color: "text-orange-400", 
      desc: "양각(포위) 노출 위험 방어",
      formula: "양각 피격 판정",
      detail: "5초 이내에 서로 다른 적 2명 이상에게 피격된 경우 위험(20점)으로 간주합니다."
    },
  ];

  return (
    <div className="@container relative p-6 sm:p-8 bg-black/40 rounded-[40px] border border-white/10 backdrop-blur-3xl shadow-2xl overflow-hidden group transition-all duration-500 hover:bg-black/50">
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 blur-[80px] rounded-full group-hover:bg-emerald-500/20 transition-colors duration-700" />
      
      <div className="flex flex-col @md:flex-row @md:items-center justify-between gap-4 mb-8">
        <div className="flex flex-col gap-1">
          <div className="text-[10px] text-emerald-400 font-black uppercase tracking-[0.3em]">공간 지각 지능 분석</div>
          <div className="text-xl sm:text-2xl font-black text-white tracking-tighter">전술적 공간 데이터</div>
        </div>
        <div className={`w-fit px-4 py-1.5 rounded-xl border text-[10px] sm:text-xs font-black transition-all ${
          data.isolationIndex > 2 ? "bg-red-500/20 border-red-500/30 text-red-400" : 
          data.isolationIndex > 1.2 ? "bg-orange-500/20 border-orange-500/30 text-orange-400" :
          "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
        }`}>
          {data.isolationIndex > 2 ? "전술적 고립: 위험" : data.isolationIndex > 1.2 ? "거리 유지: 주의" : "공간 안정성: 우수"}
        </div>
      </div>

      <div className="grid grid-cols-1 @md:grid-cols-2 gap-4 sm:gap-6">
        {stats.map((s, i) => (
          <div key={i} className="flex flex-col gap-3 p-4 bg-white/[0.03] rounded-2xl border border-white/5 group/item hover:bg-white/[0.08] transition-all relative">
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-2 text-[10px] sm:text-[11px] font-black uppercase tracking-tight ${s.color}`}>
                {s.icon} {s.label}
                <button 
                  onMouseEnter={() => setActiveTooltip(s.label)}
                  onMouseLeave={() => setActiveTooltip(null)}
                  className="opacity-40 hover:opacity-100 transition-opacity cursor-help"
                >
                  <HelpCircle size={12} />
                </button>
              </div>
              <div className="text-lg font-black text-white/90">{Math.round(s.value)}</div>
            </div>

            {/* Tooltip Content */}
            {activeTooltip === s.label && (
              <div className="absolute bottom-full left-0 mb-2 p-4 bg-[#111] border border-white/10 rounded-2xl shadow-2xl z-50 w-64 animate-in fade-in zoom-in-95 duration-200">
                <div className={`text-[10px] font-black uppercase mb-1 ${s.color}`}>{s.formula}</div>
                <div className="text-[11px] text-white/70 font-medium leading-relaxed">{s.detail}</div>
                <div className="absolute -bottom-1 left-6 w-2 h-2 bg-[#111] border-r border-b border-white/10 rotate-45" />
              </div>
            )}

            <div className="text-[10px] text-white/30 font-medium leading-tight mb-1">{s.desc}</div>
            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
              <div 
                className={`h-full bg-current transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(0,0,0,0.5)] ${s.color}`}
                style={{ width: `${s.value}%` }} 
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 pt-8 border-t border-white/10 flex flex-row items-center justify-between gap-6">
        <div className="flex flex-col relative group/iso">
          <div className="flex items-center gap-1 text-[10px] text-gray-500 font-bold uppercase tracking-widest">
            공간 고립 지수
            <HelpCircle size={10} className="opacity-50 group-hover/iso:opacity-100 transition-opacity cursor-help" />
          </div>
          
          {/* Tooltip Content */}
          <div className="absolute bottom-full left-0 mb-2 p-3 bg-[#111] border border-white/10 rounded-xl shadow-2xl z-50 w-56 opacity-0 group-hover/iso:opacity-100 transition-opacity pointer-events-none">
            <div className="text-[9px] font-black uppercase mb-1 text-emerald-400">계산 방식</div>
            <div className="text-[10px] text-white/70 font-medium leading-relaxed">
              교전 시 아군과의 거리 및 고도차를 분석한 고립도입니다. <span className="text-emerald-400">0.5 미만</span>이 우수하며, 수치가 낮을수록 백업 받기 유리한 포지셔닝을 의미합니다.
            </div>
            <div className="absolute -bottom-1 left-4 w-2 h-2 bg-[#111] border-r border-b border-white/10 rotate-45" />
          </div>

          <div className="text-2xl sm:text-4xl font-black text-white flex items-baseline gap-1">
            {data.isolationIndex} 
            <span className="text-[10px] sm:text-xs text-gray-500 font-medium uppercase">점</span>
          </div>
        </div>
        <div className="text-right flex flex-col items-end">
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">최근접 아군 거리</div>
          <div className="text-xl sm:text-2xl font-black text-white/90">
            {data.minDist}<span className="text-sm font-medium">m</span> 
            <span className="ml-2 text-[10px] sm:text-xs text-emerald-500/60 font-medium">({data.heightDiff}m 고도차)</span>
          </div>
        </div>
      </div>

      {data.isCrossfire && (
        <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4 animate-in slide-in-from-bottom-2 duration-500">
          <ShieldAlert className="text-red-400 shrink-0" size={20} />
          <div className="flex flex-col">
            <span className="text-[10px] text-red-400 font-black uppercase tracking-wider">포위(교차 사격) 노출 경고</span>
            <span className="text-[11px] text-red-200/60 font-medium leading-tight">복수 방향에서의 교전 발생. 신속한 공간 확보가 최우선입니다.</span>
          </div>
        </div>
      )}
    </div>
  );
};
