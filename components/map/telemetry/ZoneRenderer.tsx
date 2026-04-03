import React from "react";
import { Circle } from "react-leaflet";

/**
 * 텔레메트리 데이터 기반 자기장(블루존) 및 안전구역(화이트존)을 렌더링하는 컴포넌트입니다.
 */
export const ZoneRenderer = ({ telemetryData }: { telemetryData: any }) => {
  if (telemetryData?.isActive === false || telemetryData.showZone === false) return null;
  const zones: any[] = telemetryData.zoneEvents ?? [];
  if (zones.length === 0) return null;

  // 현재 타임라인 시간 이하의 가장 최근 존 스냅샷을 찾기
  let latestZone: any = null;
  for (const z of zones) {
    if (z.relativeTimeMs <= telemetryData.currentTimeMs) {
      latestZone = z;
    } else {
      break;
    }
  }
  if (!latestZone) return null;

  return (
    <>
      {/* 파란 원: 독가스 경계선 */}
      {latestZone.blueX != null && latestZone.blueY != null && latestZone.blueRadius != null && (
        <Circle
          center={[latestZone.blueY, latestZone.blueX]}
          radius={latestZone.blueRadius}
          pathOptions={{
            color: "#3b82f6",
            fillColor: "#3b82f6",
            fillOpacity: 0.06,
            weight: 2.5,
            opacity: 0.7,
            dashArray: "6 4",
          }}
          interactive={false}
        />
      )}
      {/* 하얀 원: 다음 안전구역 */}
      {latestZone.whiteX != null && latestZone.whiteY != null && latestZone.whiteRadius != null && (
        <Circle
          center={[latestZone.whiteY, latestZone.whiteX]}
          radius={latestZone.whiteRadius}
          pathOptions={{
            color: "#ffffff",
            fillColor: "transparent",
            fillOpacity: 0,
            weight: 2,
            opacity: 0.6,
            dashArray: "4 6",
          }}
          interactive={false}
        />
      )}
    </>
  );
};
