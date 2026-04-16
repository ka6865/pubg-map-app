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
      
      const pathChunks: [number, number][][] = [];
      let currentChunk: [number, number][] = [];
      let lastTime = 0;

      for (let i = 0; i < playerEvs.length; i++) {
        const e = playerEvs[i];
        if (lastTime > 0 && e.relativeTimeMs - lastTime > 30000) {
          // 30초 이상 위치 업데이트가 없었다면 부활(블루칩) 등 큰 간격으로 간주하여 선을 끊음
          if (currentChunk.length > 0) pathChunks.push(currentChunk);
          currentChunk = [];
        }
        currentChunk.push([e.y, e.x]);
        lastTime = e.relativeTimeMs;
      }
      
      if (player.y !== undefined && player.x !== undefined && currentChunk.length > 0) {
        if (currentTimeMs - lastTime > 30000) {
          pathChunks.push(currentChunk);
          currentChunk = [[player.y, player.x]];
        } else {
          currentChunk.push([player.y, player.x]);
        }
      }
      if (currentChunk.length > 0) pathChunks.push(currentChunk);
      
      // 적군은 15초, 아군은 60초 꼬리
      const TAIL_DURATION_MS = player.isEnemy ? 15000 : 60000; 
      if (pathChunks.length === 0) return null;

      const recentEvs = playerEvs.filter((e: any) => e.relativeTimeMs >= currentTimeMs - TAIL_DURATION_MS);
      const recentPathChunks: [number, number][][] = [];
      let recentChunk: [number, number][] = [];
      let rLastTime = 0;

      for (let i = 0; i < recentEvs.length; i++) {
        const e = recentEvs[i];
        if (rLastTime > 0 && e.relativeTimeMs - rLastTime > 30000) {
          if (recentChunk.length > 0) recentPathChunks.push(recentChunk);
          recentChunk = [];
        }
        recentChunk.push([e.y, e.x]);
        rLastTime = e.relativeTimeMs;
      }
      
      if (player.y !== undefined && player.x !== undefined && recentChunk.length > 0) {
        if (currentTimeMs - rLastTime > 30000) {
          recentPathChunks.push(recentChunk);
          recentChunk = [[player.y, player.x]];
        } else {
          recentChunk.push([player.y, player.x]);
        }
      }
      if (recentChunk.length > 0) recentPathChunks.push(recentChunk);

      return (
        <React.Fragment key={`track-${playerName}`}>
          <Polyline
            positions={pathChunks}
            color={trColor}
            weight={player.isEnemy ? 1.5 : 2}
            opacity={player.isEnemy ? 0.25 : 0.2}
            interactive={false}
            dashArray={player.isEnemy ? "5, 10" : undefined}
          />
          {recentPathChunks.length > 0 && (
            <Polyline
              positions={recentPathChunks}
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
