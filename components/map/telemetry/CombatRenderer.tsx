import React, { useMemo } from "react";
import { Marker, CircleMarker } from "react-leaflet";
import L from "leaflet";

const COMBAT_WINDOW_MS = 6000;
const COLORS = ["#F2A900", "#34A853", "#3b82f6", "#ef4444"];

/**
 * 교전 렌더러 컴포넌트: 실제 교전 위치 타격 이펙트 및 공격자/피해자 교전 흔적(점)을 그립니다.
 */
export const CombatRenderer = ({ telemetryData }: { telemetryData: any }) => {
  const events = telemetryData?.events;
  const currentTimeMs = telemetryData?.currentTimeMs;
  const showCombatDots = telemetryData?.showCombatDots;
  const teamNames = useMemo(() => telemetryData?.teamNames ?? [], [telemetryData?.teamNames]);
  const isActive = telemetryData?.isActive !== false && !!events;

  // 교전 타격 이펙트 렌더링 노드 생성
  const strikeNodes = useMemo(() => {
    if (!isActive) return null;
    const combatEvs = events.filter((ev: any) => {
      if (ev.type !== "kill" && ev.type !== "groggy") return false;
      if (ev.x == null || ev.y == null) return false;
      const diff = currentTimeMs - ev.relativeTimeMs;
      return diff >= 0 && diff <= COMBAT_WINDOW_MS;
    });

    return combatEvs.map((ev: any, i: number) => {
      const age = currentTimeMs - ev.relativeTimeMs;
      const lifeRatio = age / COMBAT_WINDOW_MS;
      const opacity = Math.max(0, 1 - lifeRatio);

      const attackerIdx = teamNames.indexOf(ev.attacker ?? "");
      const color = attackerIdx >= 0 ? COLORS[attackerIdx % COLORS.length] : "#ef4444";
      const isKill = ev.type === "kill";
      const innerSize = isKill ? 16 : 12;
      const outerSize = innerSize + 20;
      const emoji = isKill ? "💀" : "👊";

      const icon = L.divIcon({
        html: `
          <div style="position:relative;width:${outerSize}px;height:${outerSize}px;display:flex;align-items:center;justify-content:center;">
            <div style="
              position:absolute;
              width:${outerSize}px;height:${outerSize}px;
              border-radius:50%;
              border:2px solid ${color};
              opacity:${opacity * 0.6};
              transform:scale(${1 + lifeRatio * 1.5});
              transition:none;
            "></div>
            <span style="font-size:${innerSize}px;line-height:1;opacity:${opacity};">${emoji}</span>
          </div>`,
        className: "",
        iconSize: [outerSize, outerSize],
        iconAnchor: [outerSize / 2, outerSize / 2],
      });

      return (
        <Marker
          key={`combat-${i}-${ev.relativeTimeMs}`}
          position={[ev.y, ev.x]}
          icon={icon}
          interactive={false}
        />
      );
    });
  }, [isActive, events, currentTimeMs, teamNames]);

  // 교전 흔적(점) 렌더링 노드 생성
  const dotNodes = useMemo(() => {
    if (!isActive || showCombatDots === false) return null;

    const allCombat = events.filter((ev: any) =>
      (ev.type === "kill" || ev.type === "groggy") &&
      ev.relativeTimeMs <= currentTimeMs
    );

    const markers: React.ReactNode[] = [];

    allCombat.forEach((ev: any, i: number) => {
      const isKill = ev.type === "kill";
      const isTeamInvolved = ev.isTeamAttacker || ev.isTeamVictim;
      const attackerIdx = teamNames.indexOf(ev.attacker ?? "");

      // 공격자 점
      if (ev.x && ev.y) {
        let fillColor = "#333333";
        let strokeColor = "#666";
        if (ev.isTeamAttacker && attackerIdx >= 0) {
          fillColor = COLORS[attackerIdx % COLORS.length];
          strokeColor = fillColor;
        } else if (ev.isTeamVictim) {
          fillColor = "#ff4444";
          strokeColor = "#ff4444";
        }
        markers.push(
          <CircleMarker
            key={`cdot-atk-${i}-${ev.relativeTimeMs}`}
            center={[ev.y, ev.x]}
            radius={isKill ? 4 : 3}
            pathOptions={{
              color: strokeColor,
              fillColor,
              fillOpacity: isTeamInvolved ? 0.85 : 0.38,
              weight: isTeamInvolved ? 1.5 : 0.5,
              opacity: isTeamInvolved ? 0.9 : 0.45,
            }}
            interactive={false}
          />
        );
      }

      // 피해자 점
      if (ev.victimX && ev.victimY) {
        const victimFill = ev.isTeamVictim ? "#ef4444" : "#111111";
        markers.push(
          <CircleMarker
            key={`cdot-vic-${i}-${ev.relativeTimeMs}`}
            center={[ev.victimY, ev.victimX]}
            radius={isKill ? 3.5 : 2.5}
            pathOptions={{
              color: ev.isTeamVictim ? "#ff4444" : "#444",
              fillColor: victimFill,
              fillOpacity: ev.isTeamVictim ? 0.9 : 0.45,
              weight: ev.isTeamVictim ? 1.5 : 0.5,
              opacity: ev.isTeamVictim ? 0.9 : 0.5,
            }}
            interactive={false}
          />
        );
      }
    });

    return markers;
  }, [isActive, events, currentTimeMs, showCombatDots, teamNames]);

  if (!isActive) return null;

  return (
    <>
      {strikeNodes}
      {dotNodes}
    </>
  );
};
