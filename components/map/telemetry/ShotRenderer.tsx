import React, { useMemo } from "react";
import { Polyline, CircleMarker } from "react-leaflet";

const EFFECT_WINDOW_MS = 800;
const COLORS = ["#F2A900", "#34A853", "#3b82f6", "#ef4444"];
const MAP_SIZES: Record<string, number> = { 
  Erangel: 819200, Miramar: 819200, Sanhok: 409600, Karakin: 204800, Taego: 819200, Deston: 819200 
};

/**
 * 발사 이펙트 렌더러 (총기 발사 시 나타나는 빔과 머즐 플래시 이펙트)
 */
export const ShotRenderer = ({ telemetryData }: { telemetryData: any }) => {
  const events = telemetryData?.events;
  const currentTimeMs = telemetryData?.currentTimeMs;
  const showShotDots = telemetryData?.showShotDots;
  const mapName = telemetryData?.mapName;
  const teamNames = useMemo(() => telemetryData?.teamNames ?? [], [telemetryData?.teamNames]);
  const isActive = telemetryData?.isActive !== false && showShotDots === true && !!events;

  const shotNodes = useMemo(() => {
    if (!isActive) return null;
    const mapSize = MAP_SIZES[mapName] || 816000;

    const recentShots = events.filter((ev: any) => {
      const isEngage = ["shot", "kill", "groggy"].includes(ev.type);
      if (!isEngage || ev.x == null || ev.y == null) return false;
      const diff = currentTimeMs - ev.relativeTimeMs;
      return diff >= 0 && diff <= EFFECT_WINDOW_MS;
    });

    return recentShots.map((ev: any, i: number) => {
      const nameIdx = teamNames.indexOf(ev.name ?? "");
      const color = nameIdx >= 0 ? COLORS[nameIdx % COLORS.length] : "#ffffff";
      const age = currentTimeMs - ev.relativeTimeMs;
      const t = age / EFFECT_WINDOW_MS;

      const hasDir = (typeof ev.vX === "number" && typeof ev.vY === "number") && (ev.vX !== 0 || ev.vY !== 0);
      if (!hasDir) {
        const burstSize = 10;
        return (
          <CircleMarker
            key={`shot-burst-${i}-${ev.relativeTimeMs}`}
            center={[ev.y, ev.x]}
            radius={(1 - t) * burstSize}
            pathOptions={{
              color: color,
              fillColor: "#fff",
              fillOpacity: (1 - t),
              weight: 2
            }}
            interactive={false}
          />
        );
      } else {
        const beamLen = (3500 / mapSize) * 8192; // 약 35m
        const endX = ev.x + (ev.vX || 0) * beamLen;
        const endY = ev.y - (ev.vY || 0) * beamLen;

        return (
          <React.Fragment key={`shot-group-${i}-${ev.relativeTimeMs}`}>
            <Polyline
              positions={[[ev.y, ev.x], [endY, endX]]}
              color={ev.type === "shot" ? color : "#ff3333"}
              weight={(ev.type === "shot" ? 6 : 10) + (1 - t) * 10}
              opacity={(1 - t) * 0.8}
              interactive={false}
            />
            <CircleMarker
              center={[ev.y, ev.x]}
              radius={4 + (1 - t) * 8}
              pathOptions={{
                color: "#fff",
                fillColor: ev.type === "shot" ? color : "#ff0000",
                fillOpacity: (1 - t) * 0.9,
                weight: 1
              }}
              interactive={false}
            />
          </React.Fragment>
        );
      }
    });
  }, [isActive, events, currentTimeMs, teamNames, mapName]);

  if (!isActive) return null;
  return <>{shotNodes}</>;
};
