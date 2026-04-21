"use client";

/**
 * components/map/HotDropLayer.tsx
 *
 * leaflet.heat를 사용하여 핫드랍 히트맵 오버레이를 Leaflet 지도에 렌더링합니다.
 * MapContainer 내부에서 useMap()으로 Leaflet 인스턴스에 접근합니다.
 */

import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";

interface HotDropPoint {
  lat: number;
  lng: number;
  intensity: number;
  count: number;
}

interface HotDropLayerProps {
  mapName: string;  // 'erangel', 'miramar' 등 소문자
  visible: boolean;
}

export default function HotDropLayer({ mapName, visible }: HotDropLayerProps) {
  const map = useMap();
  const heatLayerRef = useRef<any>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "empty" | "error">("idle");
  const [season, setSeason] = useState<string | null>(null);

  // 데이터 패치 + 히트맵 레이어 초기화
  useEffect(() => {
    if (!visible || !mapName) return;

    let cancelled = false;
    setStatus("loading");

    const init = async () => {
      try {
        // 1. leaflet.heat 동적 로드 (SSR 안전)
        if (!(window as any).L?.heatLayer) {
          await import("leaflet.heat");
        }
        const L = (await import("leaflet")).default;

        // 2. API에서 히트맵 데이터 조회
        const res = await fetch(`/api/pubg/hotdrop?mapName=${encodeURIComponent(mapName)}`);
        if (!res.ok) throw new Error("API 오류");
        const json = await res.json();

        if (cancelled) return;

        if (!json.points || json.points.length === 0) {
          setStatus("empty");
          return;
        }

        setSeason(json.season);

        // 3. leaflet.heat 형식: [[lat, lng, intensity], ...]
        const heatData = json.points.map((p: HotDropPoint) => [p.lat, p.lng, p.intensity]);

        // 고해상도 그리드(256)에 맞춰 반경을 축소 (20px ~ 80px)
        const currentZoom = map.getZoom();
        const dynamicRadius = Math.max(20, Math.min(80, 15 + (currentZoom * 8)));
        // 블러를 조금 더 날카롭게 (0.6 ~ 0.7)
        const dynamicBlur = dynamicRadius * 0.7;

        // 4. 기존 레이어 제거 후 신규 생성
        if (heatLayerRef.current) {
          map.removeLayer(heatLayerRef.current);
        }

        heatLayerRef.current = (L as any).heatLayer(heatData, {
          radius: dynamicRadius, 
          blur: dynamicBlur,
          maxZoom: 18,
          max: 1.0,            // 대비를 평소보다 강하게
          minOpacity: 0.15,    // 적은 데이터는 아주 흐릿하게
          gradient: {          
            0.1: "#00eeff",
            0.3: "#00ff88",
            0.5: "#ffee00",
            0.8: "#ff8800",
            1.0: "#ff0000",
          },
        }).addTo(map);

        setStatus("done");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mapName]);

  // visible이 false가 되면 레이어 제거
  useEffect(() => {
    if (!visible && heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
      setStatus("idle");
      setSeason(null);
    }
  }, [visible, map]);

  // 줌 변경 감지하여 히트맵 스타일 실시간 업데이트
  useEffect(() => {
    if (!visible || !heatLayerRef.current) return;

    const onZoomEnd = () => {
      const L = (window as any).L;
      if (!L || !heatLayerRef.current) return;

      const currentZoom = map.getZoom();
      const dynamicRadius = Math.max(20, Math.min(80, 15 + (currentZoom * 8)));

      heatLayerRef.current.setOptions({
        radius: dynamicRadius,
        blur: dynamicRadius * 0.7
      });
    };

    map.on("zoomend", onZoomEnd);
    return () => {
      map.off("zoomend", onZoomEnd);
    };
  }, [visible, map]);

  // mapName이 바뀌면 레이어 초기화
  useEffect(() => {
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }
    setStatus("idle");
    setSeason(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapName]);

  // 상태 배지 (지도 위에 오버레이가 아닌 DOM 바깥에서 렌더링해야 하므로 null 반환)
  // 배지는 MapShell 쪽에서 status를 props/callback으로 받아 표시
  return null;
}

// 내보내기용 타입
export type { HotDropLayerProps };
export type HotDropStatus = "idle" | "loading" | "done" | "empty" | "error";
