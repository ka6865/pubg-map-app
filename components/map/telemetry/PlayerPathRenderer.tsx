import React, { useMemo } from "react";
import { Polyline } from "react-leaflet";

const COLORS = ["#F2A900", "#34A853", "#3b82f6", "#ef4444"];

/**
 * 플레이어 이동 경로(꼬리)를 렌더링하는 컴포넌트
 */
export const PlayerPathRenderer = ({ telemetryData }: { telemetryData: any }) => {
  const currentStates = telemetryData?.currentStates;
  const events = telemetryData?.events;
  const currentTimeMs = telemetryData?.currentTimeMs;
  const hiddenPlayers = telemetryData?.hiddenPlayers;
  const teamNames = useMemo(() => telemetryData?.teamNames ?? [], [telemetryData?.teamNames]);
  const isActive = telemetryData?.isActive !== false && telemetryData?.showPlayerPaths !== false && !!currentStates;

  const pathNodes = useMemo(() => {
    if (!isActive) return null;
    return Object.values(currentStates).map((player: any, idx: number) => {
      const playerName = player.name;
      if ((hiddenPlayers ?? []).includes(playerName)) return null;

      const teamIdx = teamNames.indexOf(playerName);
      const trColor = player.isEnemy ? "#000000" : COLORS[(teamIdx >= 0 ? teamIdx : idx) % COLORS.length];

      const playerEvs = (events || []).filter((e: any) => 
        (e.type === "position" || e.type === "enemy_position") && 
        e.name === playerName && 
        e.relativeTimeMs <= currentTimeMs
      );
      
      const fullPoints = playerEvs.map((e: any) => [e.y, e.x] as [number, number]);
      if (player.y !== undefined && player.x !== undefined) fullPoints.push([player.y, player.x]);
      if (fullPoints.length < 2) return null;
      
      // 적군은 15초, 아군은 60초 꼬리
      const TAIL_DURATION_MS = player.isEnemy ? 15000 : 60000; 
      const recentEvs = playerEvs.filter((e: any) => e.relativeTimeMs >= currentTimeMs - TAIL_DURATION_MS);
      const recentPoints = recentEvs.map((e: any) => [e.y, e.x] as [number, number]);
      
      if (player.y !== undefined && player.x !== undefined && recentPoints.length >= 1) {
        recentPoints.push([player.y, player.x]);
      }

      return (
        <React.Fragment key={`track-${playerName}`}>
          <Polyline
            positions={fullPoints}
            color={trColor}
            weight={player.isEnemy ? 1.5 : 2}
            opacity={player.isEnemy ? 0.25 : 0.2}
            interactive={false}
            dashArray={player.isEnemy ? "5, 10" : undefined}
          />
          {recentPoints.length >= 2 && (
            <Polyline
              positions={recentPoints}
              color={trColor}
              weight={player.isEnemy ? 3 : 4}
              opacity={player.isEnemy ? 0.6 : 0.8}
              interactive={false}
            />
          )}
        </React.Fragment>
      );
    });
  }, [isActive, currentStates, events, currentTimeMs, hiddenPlayers, teamNames]);

  if (!isActive) return null;
  return <>{pathNodes}</>;
};
