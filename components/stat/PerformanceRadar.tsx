"use client";

import React from "react";

interface PerformanceRadarProps {
  data: {
    combat: number;    // 0-100
    survival: number;  // 0-100
    support: number;   // 0-100
    precision: number; // 0-100
    strategy: number;  // 0-100
  };
}

export const PerformanceRadar = ({ data }: PerformanceRadarProps) => {
  const size = 280;
  const center = size / 2;
  const radius = size * 0.32;
  const levels = 4;
  
  const categories = [
    { key: "combat", label: "전투" },
    { key: "survival", label: "생존" },
    { key: "support", label: "지원" },
    { key: "precision", label: "정밀도" },
    { key: "strategy", label: "운영" },
  ];

  const getPoint = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / categories.length - Math.PI / 2;
    const r = (radius * Math.min(100, value)) / 100;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  const points = categories.map((cat, i) => getPoint(i, (data as any)[cat.key]));
  const pathData = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background Grids */}
        {[...Array(levels)].map((_, i) => {
          const r = (radius * (i + 1)) / levels;
          const gridPoints = categories.map((_, j) => {
            const angle = (Math.PI * 2 * j) / categories.length - Math.PI / 2;
            return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
          }).join(" ");
          return (
            <polygon
              key={i}
              points={gridPoints}
              fill="none"
              stroke="white"
              strokeOpacity={0.05}
              strokeWidth="1"
            />
          );
        })}

        {/* Axes */}
        {categories.map((_, i) => {
          const p = getPoint(i, 100);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={p.x}
              y2={p.y}
              stroke="white"
              strokeOpacity={0.05}
              strokeWidth="1"
            />
          );
        })}

        {/* User Area Area */}
        <path
          d={pathData}
          fill="url(#radarGradientMatch)"
          fillOpacity={0.5}
          stroke="#6366f1"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-all duration-1000 ease-out"
        />

        {/* Points at vertices */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="#818cf8" className="shadow-lg" />
        ))}

        {/* Labels */}
        {categories.map((cat, i) => {
          const p = getPoint(i, 135);
          return (
            <text
              key={i}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              className="fill-gray-400 font-black text-[11px] tracking-tighter"
              dominantBaseline="middle"
            >
              {cat.label}
            </text>
          );
        })}

        <defs>
          <linearGradient id="radarGradientMatch" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};
