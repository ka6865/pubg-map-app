import React, { useState, useEffect, useRef } from "react";
import { Marker, Polyline, Circle, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";

const flightPointIcon = L.divIcon({
  className: "flight-point-sim",
  html: `<div style="width:16px;height:16px;background:#3b82f6;border:2px solid white;border-radius:50%;box-shadow:0 0 10px #3b82f6;"></div>`,
  iconSize: [16, 16],
});

const MAP_ID_TO_INTERNAL: Record<string, string[]> = {
  "erangel": ["baltic_main", "erangel_main"],
  "miramar": ["desert_main"],
  "taego": ["tiger_main"],
  "sanhok": ["savage_main"],
  "rondo": ["neon_main"],
  "deston": ["kiki_main"],
  "vikendi": ["dihorotok_main"],
  "karakin": ["summerland_main"],
  "paramo": ["chimera_main"],
};

interface SimulatorLayerProps {
  activeMode: string;
  mapScale: number;
  activeMapId: string;
  currentStep: number;
  simulatorPhases?: any[];
  setSimulatorPhases?: any;
  setSimulatorStep?: any;
  flightPoints: L.LatLng[];
  setFlightPoints: any;
}

export function SimulatorLayer({ 
  activeMode, mapScale, activeMapId, currentStep,
  simulatorPhases = [], setSimulatorPhases, setSimulatorStep,
  flightPoints, setFlightPoints
}: SimulatorLayerProps) {
  const map = useMap();
  const heatLayerRef = useRef<any>(null);
  const [bluezoneData, setBluezoneData] = useState<any[]>([]);
  const [hoverPoint, setHoverPoint] = useState<L.LatLng | null>(null);

  // 1. 데이터 로드
  useEffect(() => {
    if (activeMode === "simulate" && bluezoneData.length === 0) {
      fetch("/api/bluezone")
        .then(res => res.json())
        .then(data => setBluezoneData(data))
        .catch(err => console.error("Bluezone data load failed:", err));
    }
  }, [activeMode, bluezoneData.length]);
  // 2. KNN 기반 매칭 로직 (useMemo로 최적화 및 상태 독립)
  const { matchesToRender, currentPhaseRadius, matchedFlightPaths } = React.useMemo(() => {
    let toRender: any[] = [];
    let phaseRadius = 3000;
    let flightPaths: L.LatLng[][] = [];

    if (!activeMapId || bluezoneData.length === 0) {
      return { matchesToRender: toRender, currentPhaseRadius: phaseRadius, matchedFlightPaths: flightPaths };
    }

    const internalNames = MAP_ID_TO_INTERNAL[activeMapId.toLowerCase()] || [activeMapId.toLowerCase()];
    const currentMapMatches = bluezoneData.filter(
      m => internalNames.includes(m.mapName?.toLowerCase()) && m.phases.length > 1
    );

    toRender = currentMapMatches;

    if (flightPoints.length === 2) {
      const uA = flightPoints[0];
      const uB = flightPoints[1];

      const scoredMatches = currentMapMatches.map(match => {
        if (!match.flightPath || match.flightPath.length !== 2) return { match, dist: Infinity };
        const mA = { lat: 8192 - match.flightPath[0].lat, lng: match.flightPath[0].lng };
        const mB = { lat: 8192 - match.flightPath[1].lat, lng: match.flightPath[1].lng };

        const dist1 = Math.sqrt(Math.pow(uA.lat - mA.lat, 2) + Math.pow(uA.lng - mA.lng, 2)) + 
                      Math.sqrt(Math.pow(uB.lat - mB.lat, 2) + Math.pow(uB.lng - mB.lng, 2));
        const dist2 = Math.sqrt(Math.pow(uA.lat - mB.lat, 2) + Math.pow(uA.lng - mB.lng, 2)) + 
                      Math.sqrt(Math.pow(uB.lat - mA.lat, 2) + Math.pow(uB.lng - mA.lng, 2));

        return { match, dist: Math.min(dist1, dist2) };
      }).filter(m => m.dist !== Infinity);

      // 비행기 경로가 너무 동떨어진 매치는 철저히 배제 (출발/도착점 오차 합이 3.5km 이상이면 버림)
      const validMatches = scoredMatches.filter(m => m.dist < 3500);
      validMatches.sort((a, b) => a.dist - b.dist);
      
      // [최적화] 필터링을 통과한 매치는 모두 사용 (최대 200개) - 데이터가 많아질수록 더 정밀한 핫스팟 형성
      const takeCount = Math.max(5, Math.min(200, validMatches.length)); 
      toRender = validMatches.slice(0, takeCount).map(m => m.match);

      // 경로 완성 시 또는 1페이즈일 때 매칭된 비행기 경로 표시
      if (currentStep <= 1) {
        flightPaths = toRender.map(m => [
          L.latLng(8192 - m.flightPath[0].lat, m.flightPath[0].lng),
          L.latLng(8192 - m.flightPath[1].lat, m.flightPath[1].lng)
        ]);
      }
    } else if (currentStep === 0) {
      if (flightPoints.length === 1) {
        // [고도화] 첫 번째 점을 찍었을 때, 그 근처(1.5km)에서 시작/종료되는 경로들만 가이드로 표시
        const uA = flightPoints[0];
        flightPaths = currentMapMatches.map(m => {
          if (!m.flightPath || m.flightPath.length !== 2) return null;
          const mA = { lat: 8192 - m.flightPath[0].lat, lng: m.flightPath[0].lng };
          const mB = { lat: 8192 - m.flightPath[1].lat, lng: m.flightPath[1].lng };

          const dStart = Math.sqrt(Math.pow(uA.lat - mA.lat, 2) + Math.pow(uA.lng - mA.lng, 2));
          const dEnd = Math.sqrt(Math.pow(uA.lat - mB.lat, 2) + Math.pow(uA.lng - mB.lng, 2));

          if (Math.min(dStart, dEnd) < 800) {
            return [
              L.latLng(8192 - m.flightPath[0].lat, m.flightPath[0].lng),
              L.latLng(8192 - m.flightPath[1].lat, m.flightPath[1].lng)
            ];
          }
          return null;
        }).filter(Boolean) as L.LatLng[][];
      } else if (flightPoints.length === 0) {
        // 사용자가 경로를 그리기 전(전체 가이드라인)
        flightPaths = currentMapMatches.slice(0, 100).map(m => {
          if (!m.flightPath || m.flightPath.length !== 2) return null;
          return [
            L.latLng(8192 - m.flightPath[0].lat, m.flightPath[0].lng),
            L.latLng(8192 - m.flightPath[1].lat, m.flightPath[1].lng)
          ];
        }).filter(Boolean) as L.LatLng[][];
      }
    }

    for (let s = 1; s < currentStep; s++) {
      const userPhase = simulatorPhases[s - 1];
      if (!userPhase) continue;
      
      const phasedMatches = toRender.map(match => {
        const pData = match.phases.find((p: any) => p.phase === s);
        if (!pData) return { match, dist: Infinity };
        const dist = Math.sqrt(Math.pow(userPhase.center.lat - (8192 - pData.y), 2) + Math.pow(userPhase.center.lng - pData.x, 2));
        return { match, dist };
      }).filter(m => m.dist !== Infinity);

      phasedMatches.sort((a, b) => a.dist - b.dist);
      toRender = phasedMatches.slice(0, 50).map(m => m.match);
    }

    let totalRadius = 0, count = 0;
    toRender.forEach(match => {
      const pCurrent = match.phases.find((p: any) => p.phase === Math.max(1, currentStep));
      if (pCurrent && pCurrent.radius) { totalRadius += pCurrent.radius; count++; }
    });
    if (count > 0) phaseRadius = totalRadius / count;

    return { matchesToRender: toRender, currentPhaseRadius: phaseRadius, matchedFlightPaths: flightPaths };
  }, [activeMapId, bluezoneData, flightPoints, simulatorPhases, currentStep]);

  // 3. 히트맵 렌더링 및 실시간 업데이트
  useEffect(() => {
    // 시뮬레이션 모드가 아니거나 데이터가 없으면 즉시 제거
    if (activeMode !== "simulate" || currentStep < 1 || matchesToRender.length === 0) {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      return;
    }

    const updateHeatmap = async () => {
      // 1. 라이브러리 및 맵 인스턴스 준비
      if (!(window as any).L?.heatLayer) {
        await import("leaflet.heat");
      }
      const L = (await import("leaflet")).default;

      // 2. 현재 페이즈 데이터 추출 (이전 원 내부에 있는 경우만 포함)
      const heatData = matchesToRender.map(match => {
        const pCurrent = match.phases.find((p: any) => p.phase === currentStep);
        if (!pCurrent) return null;

        // [핵심] 만약 2페이즈 이상이라면, 현재 히트맵 포인트가 이전 페이즈 원 내부에 있는지 검증
        if (currentStep > 1 && simulatorPhases.length >= currentStep - 1) {
          const prevUserPhase = simulatorPhases[currentStep - 2];
          const dist = Math.sqrt(
            Math.pow((8192 - pCurrent.y) - prevUserPhase.center.lat, 2) + 
            Math.pow(pCurrent.x - prevUserPhase.center.lng, 2)
          );
          
          // 이전 사용자 원의 반경 밖이라면 확률 계산에서 제외 (원 밖 히트맵 제거)
          if (dist > (prevUserPhase.radius / mapScale)) {
            return null;
          }
        }

        return [8192 - pCurrent.y, pCurrent.x, 1.0]; // Y축 반전
      }).filter(Boolean) as any[];

      // 3. 레이어 업데이트 또는 생성 (중복 생성 방지 핵심 로직)
      if (heatLayerRef.current) {
        // 데이터가 적을수록 max값을 낮춰서 색상을 진하게 만듦
        const dynamicMax = Math.max(1.0, Math.min(2.5, heatData.length / 4));
        heatLayerRef.current.setOptions({ max: dynamicMax });
        heatLayerRef.current.setLatLngs(heatData);
      } else {
        // 데이터가 적을수록 max값을 낮춰서 색상을 진하게 만듦
        const dynamicMax = Math.max(1.0, Math.min(2.5, heatData.length / 4));
        // 처음 생성할 때만 설정 적용
        heatLayerRef.current = (L as any).heatLayer(heatData, {
          radius: 45, // 35 -> 45로 키워서 시인성 확보
          blur: 25,
          maxZoom: 1, 
          max: dynamicMax,
          gradient: {
            0.2: "blue",
            0.4: "cyan",
            0.6: "lime",
            0.8: "yellow",
            1.0: "red"
          }
        }).addTo(map);
      }
    };

    updateHeatmap();

    // 언마운트 시 또는 업데이트 전 클린업 (항상 제거하여 새 설정 반영 보장)
    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode, currentStep, activeMapId, bluezoneData, map, flightPoints, simulatorPhases, matchesToRender]);
  
  useMapEvents({
    mousemove(e) {
      if (activeMode !== "simulate") return;
      if (currentStep >= 1 && flightPoints.length === 2) {
        setHoverPoint(e.latlng);
      } else {
        if (hoverPoint) setHoverPoint(null);
      }
    },
    click(e) {
      if (activeMode !== "simulate") return;
      if (currentStep === 0) {
        if (flightPoints.length < 2) {
          setFlightPoints([...flightPoints, e.latlng]);
        }
        // 이미 2개가 찍혀있으면 무시 (고정)
      } else if (currentStep >= 1) {
        // [중요] 이전 페이즈 원 안쪽인지 검증 (PUBG 규칙)
        if (currentStep > 1 && simulatorPhases.length >= currentStep - 1) {
          const prevPhase = simulatorPhases[currentStep - 2];
          if (prevPhase) {
            const dist = Math.sqrt(
              Math.pow(e.latlng.lat - prevPhase.center.lat, 2) + 
              Math.pow(e.latlng.lng - prevPhase.center.lng, 2)
            );
            
            if (dist > prevPhase.radius) {
              alert("다음 자기장은 반드시 이전 자기장 안에 위치해야 합니다.");
              return;
            }
          }
        }

        // 도장 찍기
        if (setSimulatorPhases && setSimulatorStep) {
          setSimulatorPhases((prev: any[]) => [
            ...prev,
            { center: e.latlng, radius: currentPhaseRadius }
          ]);
          setSimulatorStep((s: number) => s + 1);
        }
      }
    },
    contextmenu(e) {
      e.originalEvent.preventDefault();
      if (activeMode !== "simulate") return;
      if (currentStep === 0) {
        setFlightPoints([]);
      } else if (currentStep >= 1) {
        // 이전 스텝으로 돌아가기 (도장 지우기)
        if (setSimulatorPhases && setSimulatorStep) {
          setSimulatorStep((s: number) => Math.max(0, s - 1));
          setSimulatorPhases((prev: any[]) => prev.slice(0, -1));
        }
      }
    }
  });

  if (activeMode !== "simulate") return null;

  return (
    <>
      {flightPoints.map((p, i) => (
        <Marker key={`flight-${i}`} position={p} icon={flightPointIcon} />
      ))}
      {flightPoints.length === 2 && (
        <Polyline
          positions={flightPoints.map(p => [p.lat, p.lng])}
          color="#3b82f6"
          weight={4}
          dashArray="10, 10"
          interactive={false}
        />
      )}
      
      {/* 과거 매칭된 매치들의 비행기 선 (점 0개일때 희미하게, 1개일때 진하게, 2개일때 숨김) */}
      {flightPoints.length < 2 && matchedFlightPaths.map((path, idx) => (
        <Polyline
          key={`matched-flight-${flightPoints.length}-${idx}`}
          positions={path}
          color="white"
          weight={flightPoints.length === 1 ? 4 : 2}
          opacity={flightPoints.length === 1 ? 0.6 : 0.15}
          dashArray="4, 8"
          interactive={false}
        />
      ))}
      
      {/* 유저가 확정한 페이즈 도장들 */}
      {simulatorPhases.slice(0, Math.max(0, currentStep - 1)).map((phase, idx) => (
        <Circle
          key={`phase-${idx}`}
          center={phase.center}
          radius={phase.radius}
          pathOptions={{ 
            color: idx === currentStep - 2 ? "blue" : "white", 
            fillColor: "blue", 
            fillOpacity: 0, 
            weight: idx === currentStep - 2 ? 3 : 1 
          }}
          interactive={false}
        />
      ))}

      {/* 현재 페이즈 도장 찍기 미리보기 (마우스 호버) */}
      {currentStep >= 1 && hoverPoint && flightPoints.length === 2 && (
        <Circle
          center={hoverPoint}
          radius={currentPhaseRadius}
          pathOptions={{ color: "white", fillColor: "white", fillOpacity: 0, weight: 2, dashArray: "4 4" }}
          interactive={false}
        />
      )}
    </>
  );
}
