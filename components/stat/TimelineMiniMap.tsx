"use client";

import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L, { CRS } from "leaflet";
import "leaflet/dist/leaflet.css";

interface TimelineMiniMapProps {
  selectedEvent?: any;
  mapId: string;
  className?: string;
}

const MAP_IMAGES: Record<string, string> = {
  Erangel: "/tiles/Erangel",
  Miramar: "/tiles/Miramar",
  Taego: "/tiles/Taego",
  Rondo: "/tiles/Rondo",
  Vikendi: "/tiles/Vikendi",
  Deston: "/tiles/Deston",
  Sanhok: "/tiles/Sanhok",
  Karakin: "/tiles/Karakin",
  Paramo: "/tiles/Paramo",
  Haven: "/tiles/Haven",
};

// [V43.0] 고해상도 닉네임 마커 생성기
const createPingIcon = (nickname: string, type: 'attacker' | 'victim' | 'normal') => {
  const bgColor = type === 'attacker' ? 'bg-red-500' : type === 'victim' ? 'bg-emerald-500' : 'bg-blue-500';
  const shadowColor = type === 'attacker' ? 'rgba(239,68,68,0.8)' : type === 'victim' ? 'rgba(16,185,129,0.8)' : 'rgba(59,130,246,0.8)';
  
  return L.divIcon({
    className: "timeline-marker",
    html: `
      <div class="relative flex flex-col items-center group">
        <!-- Nickname Label -->
        <div class="absolute bottom-full mb-2 px-2 py-1 ${bgColor} rounded-md shadow-xl border border-white/20 whitespace-nowrap">
          <span class="text-[10px] font-black text-white uppercase tracking-tighter">${nickname}</span>
          <div class="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-${type === 'attacker' ? 'red-500' : type === 'victim' ? 'emerald-500' : 'blue-500'}"></div>
        </div>
        
        <!-- Ripple Effect -->
        <div class="absolute w-8 h-8 ${bgColor}/20 rounded-full animate-ping"></div>
        
        <!-- Center Point -->
        <div class="w-4 h-4 ${bgColor} rounded-full border-2 border-white shadow-[0_0_12px_${shadowColor}] z-10 transition-transform group-hover:scale-125"></div>
      </div>
    `,
    iconSize: [32, 48],
    iconAnchor: [16, 16],
  });
};

import { toCalibratedCoords } from "@/utils/coordinate";

const MapController = ({ event, mapId }: { event?: any, mapId: string }) => {
  const map = useMap();

  useEffect(() => {
    // Leaflet의 tap 핸들러가 모바일에서 click 이벤트를 삼키는 현상을 방지
    if ((map as any).tap) {
      (map as any).tap.disable();
    }
  }, [map]);

  useEffect(() => {
    if (event && event.x !== undefined && event.y !== undefined) {
      const calibrated = toCalibratedCoords(event.x, event.y, mapId);
      map.setView(calibrated, 0, { animate: true });
    }
  }, [map, event, mapId]);

  if (!event) return null;

  const markers: React.ReactNode[] = [];

  // 1. 본인(또는 주체) 위치 항상 표시 (x, y)
  if (event.x !== undefined && event.y !== undefined) {
    const mainPlayerName = event.playerName || (event.isMe ? "ME" : "Player");
    markers.push(
      <Marker 
        key="main-player"
        position={toCalibratedCoords(event.x, event.y, mapId)} 
        icon={createPingIcon(mainPlayerName, 'normal')} 
      />
    );
  }

  // 2. 가해자(Attacker) 위치 표시 (본인 좌표와 다를 경우에만)
  if (event.attackerX !== undefined && event.attackerY !== undefined) {
    const isDifferent = Math.abs(event.attackerX - (event.x || 0)) > 1 || Math.abs(event.attackerY - (event.y || 0)) > 1;
    if (isDifferent) {
      markers.push(
        <Marker 
          key="attacker"
          position={toCalibratedCoords(event.attackerX, event.attackerY, mapId)} 
          icon={createPingIcon(event.attacker || "Attacker", 'attacker')} 
        />
      );
    }
  }

  // 3. 피해자(Victim) 위치 표시 (본인 좌표와 다를 경우에만)
  if (event.victimX !== undefined && event.victimY !== undefined) {
    const isDifferent = Math.abs(event.victimX - (event.x || 0)) > 1 || Math.abs(event.victimY - (event.y || 0)) > 1;
    if (isDifferent) {
      markers.push(
        <Marker 
          key="victim"
          position={toCalibratedCoords(event.victimX, event.victimY, mapId)} 
          icon={createPingIcon(event.victim || "Victim", 'victim')} 
        />
      );
    }
  }


  return <>{markers}</>;
};

export const TimelineMiniMap = ({ selectedEvent, mapId, className = "" }: TimelineMiniMapProps) => {
  return (
    <div className={`relative rounded-2xl overflow-hidden border border-white/10 bg-black/40 ${className}`} style={{ height: "100%", width: "100%" }}>
      <MapContainer
        center={[4096, 4096]}
        zoom={-3}
        minZoom={-5}
        maxZoom={2}
        crs={CRS.Simple}
        style={{ height: "100%", width: "100%", background: "#0b0f19" }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url={`${MAP_IMAGES[mapId] || MAP_IMAGES.Erangel}/{z}/{x}/{y}.jpg`}
          minZoom={-5}
          maxZoom={2}
          maxNativeZoom={0}
          zoomOffset={5}
          noWrap={true}
          bounds={[[0, 0], [8192, 8192]]}
        />
        <MapController event={selectedEvent} mapId={mapId} />
      </MapContainer>
    </div>
  );
};
