"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation"; // 🌟 useSearchParams 추가
import {
  MapContainer,
  TileLayer,
  Marker,
  CircleMarker,
  Tooltip,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L, { CRS } from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "../lib/supabase";
import { CATEGORY_INFO } from "../lib/map_config";
import { toast } from "sonner";
import { useMapSettings } from "@/hooks/useMapSettings";


// SVG 경로와 색상을 조합해 커스텀 지도 마커 아이콘 객체 생성
const createPinIcon = (colorCode: string, pathData: string) => {
  return L.divIcon({
    className: "custom-pin-icon",
    html: `
      <div style="position: relative; width: 28px; height: 38px;">
        <svg viewBox="0 0 30 42" style="width: 100%; height: 100%; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3));">
          <path d="M15 0C6.7 0 0 6.7 0 15c0 8.3 15 27 15 27s15-18.7 15-27C30 6.7 23.3 0 15 0z" fill="${colorCode}"/>
        </svg>
        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 26px; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: white;">
            <path d="${pathData}"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [28, 38],
    iconAnchor: [14, 38],
  });
};

const MAP_LIST = [
  { id: "Erangel", label: "에란겔", imageUrl: "/Erangel.jpg" },
  { id: "Miramar", label: "미라마", imageUrl: "/Miramar.jpg" },
  { id: "Taego", label: "태이고", imageUrl: "/Taego.jpg" },
  { id: "Rondo", label: "론도", imageUrl: "/Rondo.jpg" },
  { id: "Vikendi", label: "비켄디", imageUrl: "/Vikendi.jpg" },
  { id: "Deston", label: "데스턴", imageUrl: "/Deston.jpg" },
];

/**
 * 🌟 [추가] 맵/카테고리별 ID 생성 규칙 매핑 테이블 (M CC III 방식)
 */
const MAP_INDEX_MAP: Record<string, number> = {
  Erangel: 1,
  Miramar: 2,
  Taego: 3,
  Vikendi: 4,
  Deston: 5,
  Rondo: 6,
};

const CATEGORY_CODE_MAP: Record<string, number> = {
  Garage: 1,
  Esports: 2,
  Boat: 3,
  EsportsBoat: 4,
  Glider: 5,
  Key: 6,
  Porter: 7,
  SecretRoom: 8,
  GoldenMirado: 9,
  EsportsMirado: 10,
  EsportsPickup: 11,
  PoliceCar: 12,
  SecurityCard: 13,
  GasPump: 14,
  Snowmobile: 15,
};

const MapEvents = ({
  onClick,
}: {
  onClick: (e: L.LeafletMouseEvent) => void;
}) => {
  useMapEvents({ click: onClick });
  return null;
};

// 🌟 [추가] 초기 로딩 시 URL 좌표로 화면을 이동시켜주는 내부 컴포넌트
const MapController = ({
  center,
  zoom,
}: {
  center: [number, number];
  zoom: number;
}) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center, zoom, map]);
  return null;
};

const MapEditorComponent = () => {
  const router = useRouter();
  const searchParams = useSearchParams(); // 🌟 URL 파라미터 읽기

  const [isAuthorized, setIsAuthorized] = useState(false);
  const [activeMapId, setActiveMapId] = useState("Erangel");
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const currentMap = MAP_LIST.find((m) => m.id === activeMapId);

  const imageWidth = 8192;
  const imageHeight = 8192;
  const bounds: [[number, number], [number, number]] = [
    [0, 0],
    [imageHeight, imageWidth],
  ];

  // 🌟 URL 쿼리에 넘어온 디스코드 제보 좌표 파싱
  const latParam = searchParams?.get("lat");
  const lngParam = searchParams?.get("lng");

  // 🌟 useMemo를 사용하여 리렌더링 시 배열 참조가 바뀌지 않도록 보정 (줌 초기화 방지)
  const initialCenter = useMemo<[number, number]>(() => {
    return latParam && lngParam
      ? [Number(latParam), Number(lngParam)]
      : [imageHeight / 2, imageWidth / 2];
  }, [latParam, lngParam, imageHeight, imageWidth]);

  const initialZoom = useMemo(() => {
    return latParam && lngParam ? 0 : -3;
  }, [latParam, lngParam]);

  const [isLoaded, setIsLoaded] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [pendingVehicles, setPendingVehicles] = useState<any[]>([]);

  // DB 기반 동적 카테고리 로드
  const { activeCategories: allowedCategories, categoryInfoMap } = useMapSettings(activeMapId);

  const icons = useMemo(() => {
    const res: Record<string, L.DivIcon> = {};
    Object.keys(categoryInfoMap).forEach((key) => {
      res[key] = createPinIcon(
        categoryInfoMap[key].color,
        categoryInfoMap[key].path
      );
    });
    return res;
  }, [categoryInfoMap]);

  const [activeType, setActiveType] = useState<string>("Esports");
  const [filters, setFilters] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    Object.keys(categoryInfoMap).forEach((k) => (init[k] = true));
    return init;
  });


  useEffect(() => {
    if (
      allowedCategories.length > 0 &&
      !allowedCategories.includes(activeType)
    ) {
      setActiveType(allowedCategories[0]);
    }
  }, [activeMapId, activeType, allowedCategories]);

  useEffect(() => {
    const checkAdmin = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error("관리자 로그인이 필요합니다.");
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (profile?.role !== "admin") {
        toast.warning("관리자 권한이 없습니다.");
        router.push("/");
        return;
      }

      setIsAuthorized(true);

      // 현재 활성화된 맵의 마커만 DB에서 가져옵니다.
      const { data: dbMarkers, error: fetchError } = await supabase
        .from("map_markers")
        .select("*")
        .eq("map_id", activeMapId); // 현재 맵 ID로 필터링

      if (fetchError) {
        console.error("Error fetching map markers:", fetchError);
        toast.error("마커 데이터를 불러오는 데 실패했습니다.");
        return;
      }

      const currentMapMarkers = dbMarkers
        ? dbMarkers.map((v) => ({ ...v, mapId: v.map_id }))
        : [];

      setVehicles(currentMapMarkers);

      const { data: pendingData } = await supabase
        .from("pending_markers")
        .select("*")
        .eq("map_name", activeMapId);
        
      setPendingVehicles(pendingData || []);

      setIsLoaded(true); // 데이터 로드 완료
    };
    checkAdmin();
  }, [router, activeMapId]); // activeMapId가 변경될 때마다 다시 로드

  useEffect(() => {
    if (isLoaded)
      localStorage.setItem("pubg-vehicles", JSON.stringify(vehicles));
  }, [vehicles, isLoaded]);

  const visibleVehicles = useMemo(() => {
    return vehicles.filter(
      (v) =>
        (v.mapId === activeMapId || (!v.mapId && activeMapId === "Erangel")) &&
        filters[v.type]
    );
  }, [vehicles, activeMapId, filters]);

  const removeVehicle = (id: number) =>
    setVehicles((prev) => prev.filter((v) => v.id !== id));

  const clearAllVehicles = () => {
    const currentMapCount = vehicles.filter(
      (v) => v.mapId === activeMapId || (!v.mapId && activeMapId === "Erangel")
    ).length;
    if (
      window.confirm(
        `현재 '${currentMap?.label}' 맵의 마커 ${currentMapCount}개를 모두 삭제하시겠습니까? (다른 맵의 마커는 유지됩니다)`
      )
    ) {
      setVehicles((prev) =>
        prev.filter(
          (v) =>
            !(
              v.mapId === activeMapId ||
              (!v.mapId && activeMapId === "Erangel")
            )
        )
      );
    }
  };

  const updateVehiclePos = (id: number, newY: number, newX: number) => {
    setVehicles((prev) =>
      prev.map((v) => (v.id === id ? { ...v, y: newY, x: newX } : v))
    );
  };

  const toggleFilter = (type: string) =>
    setFilters((prev) => ({ ...prev, [type]: !prev[type] }));

  const getCount = (type: string) =>
    vehicles.filter(
      (v) =>
        (v.mapId === activeMapId || (!v.mapId && activeMapId === "Erangel")) &&
        v.type === type
    ).length;

  const totalCount = vehicles.filter(
    (v) => v.mapId === activeMapId || (!v.mapId && activeMapId === "Erangel")
  ).length;

  const handleSaveToDB = async () => {
    if (
      !confirm(
        `'${currentMap?.label}' 맵의 변경사항을 서버에 저장하시겠습니까?`
      )
    )
      return;
    setIsSaving(true);

    try {
      const { data: dbMarkers } = await supabase
        .from("map_markers")
        .select("id")
        .eq("map_id", activeMapId);
      const dbIds = dbMarkers?.map((m) => m.id) || [];
      const currentMapVehicles = vehicles.filter(
        (v) =>
          v.mapId === activeMapId || (!v.mapId && activeMapId === "Erangel")
      );
      const currentIds = currentMapVehicles.map((v) => v.id);

      const idsToDelete = dbIds.filter((id) => !currentIds.includes(id));
      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from("map_markers")
          .delete()
          .in("id", idsToDelete);
        if (deleteError) throw deleteError;
      }

      const insertData = currentMapVehicles.map((v) => ({
        id: Number(v.id),
        map_id: String(v.mapId || activeMapId),
        name: String(v.name || ""),
        type: String(v.type),
        x: Math.round(v.x),
        y: Math.round(v.y),
      }));

      if (insertData.length > 0) {
        const chunkSize = 500;
        for (let i = 0; i < insertData.length; i += chunkSize) {
          const chunk = insertData.slice(i, i + chunkSize);
          const { error: insertError } = await supabase
            .from("map_markers")
            .upsert(chunk);
          if (insertError) throw insertError;
        }
      }
      toast.success(
        `'${currentMap?.label}' 맵의 마커 ${insertData.length}개가 저장되었습니다!`
      );
    } catch (error: any) {
      console.error("서버 저장 에러:", error);
      toast.error("저장 실패: " + (error.message || "알 수 없는 오류 발생."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleMapClick = (e: L.LeafletMouseEvent) => {
    const newVehicle = {
      id: Date.now(),
      name: categoryInfoMap[activeType]?.label || "마커",
      x: e.latlng.lng,
      y: e.latlng.lat,
      mapId: activeMapId,
      type: activeType,
    };
    setVehicles((prev) => [...prev, newVehicle]);
  };

  /**
   * 🌟 [추가] 로컬 JSON 파일을 읽어 현재 마커 리스트에 추가합니다.
   * 사용자 요청에 따라 M CC III 규칙으로 ID를 자동 생성합니다.
   */
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const importedData = JSON.parse(content);

        if (!Array.isArray(importedData)) {
          throw new Error("올바른 JSON 배열 형식이 아닙니다.");
        }

        const mapIdx = MAP_INDEX_MAP[activeMapId] || 9; // 알 수 없는 맵은 9번대 사용
        const newMarkers = importedData.map((item: any, index: number) => {
          const catCode = CATEGORY_CODE_MAP[item.type] || 99; // 알 수 없는 타입은 99번대 사용
          
          // M CC III 조합 (예: 6 14 001)
          // 현재 리스트에 있는 마커들 중 해당 타입의 최대 ID를 찾아 그 다음 번호부터 부여
          const prefix = mapIdx * 100000 + catCode * 1000;
          const sameTypeMarkers = vehicles.filter(v => 
            v.mapId === activeMapId && 
            Math.floor(Number(v.id) / 1000) === Math.floor(prefix / 1000)
          );
          
          const maxIdx = sameTypeMarkers.length > 0 
            ? Math.max(...sameTypeMarkers.map(v => Number(v.id) % 1000))
            : 0;

          return {
            id: prefix + maxIdx + index + 1,
            mapId: item.map_id || activeMapId,
            type: item.type,
            name: item.name || categoryInfoMap[item.type]?.label || "추출 마커",
            x: Number(item.x),
            y: Number(item.y),
          };
        });

        setVehicles((prev) => [...prev, ...newMarkers]);
        toast.success(`${newMarkers.length}개의 마커를 성공적으로 추가했습니다!`, {
          description: "변경사항을 서버에 저장하려면 '서버에 저장' 버튼을 눌러주세요."
        });
      } catch (err: any) {
        toast.error("파일 로드 실패: " + err.message);
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  if (!isAuthorized)
    return (
      <div className="w-full h-screen bg-[#0f172a] flex items-center justify-center text-white font-bold">
        권한 확인 중...
      </div>
    );

  return (
    <div className="flex flex-col w-full h-screen bg-[#0f172a]">
      <header className="flex items-center justify-between h-[50px] px-4 bg-[#F2A900] border-b-2 border-[#cc8b00] z-[6000] shrink-0">
        <div className="flex items-center gap-4">
          <div className="text-xl font-black italic text-black select-none cursor-default">
            PUBG<span className="text-white">EDITOR</span>
          </div>
          <nav className="flex gap-1">
            {MAP_LIST.map((m) => (
              <button
                key={m.id}
                onClick={() => setActiveMapId(m.id)}
                className={`h-[30px] px-3 rounded font-bold text-xs transition-colors ${
                  activeMapId === m.id
                    ? "bg-[#1a1a1a] text-white"
                    : "bg-transparent text-black hover:bg-black/10"
                }`}
              >
                {m.label}
              </button>
            ))}
          </nav>
        </div>
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1 text-black hover:text-white px-3 py-1 transition-colors rounded hover:bg-black/20 font-bold text-xs"
        >
          나가기
        </button>
      </header>

      <div className="flex-1 relative w-full h-full overflow-hidden">
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] flex flex-wrap gap-2 bg-[#1e293b] border border-[#334155] p-3 rounded-xl shadow-2xl items-center justify-center max-w-[90vw]">
          {allowedCategories.map((id) => {
            const info = CATEGORY_INFO[id];
            if (!info) return null; // 방어 로직 추가
            const isActive = activeType === id;
            const isFiltered = filters[id];
            return (
              <button
                key={id}
                onClick={() => {
                  setActiveType(id);
                  if (isActive) toggleFilter(id);
                }}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg font-bold text-sm transition-all border ${
                  isFiltered ? "" : "opacity-40 grayscale"
                } ${
                  isActive
                    ? "ring-2 ring-offset-2 ring-offset-[#1e293b] ring-[#F2A900]"
                    : ""
                }`}
                style={{
                  backgroundColor: isFiltered ? `${info.color}20` : "#334155",
                  color: isFiltered ? info.color : "#94a3b8",
                  borderColor: isFiltered ? info.color : "#475569",
                }}
              >
                {info.label} ({getCount(id)})
              </button>
            );
          })}

          <div className="w-px h-6 bg-[#475569] mx-1"></div>

          <button
            onClick={clearAllVehicles}
            className="flex items-center gap-1 text-gray-400 hover:text-red-500 px-2 py-1 transition-colors rounded hover:bg-white/10"
            title="전체 삭제"
          >
            삭제{" "}
            <span className="text-xs font-medium text-white">
              ({totalCount})
            </span>
          </button>

          <button
            onClick={handleSaveToDB}
            disabled={isSaving}
            className={`flex items-center gap-1 px-3 py-1 transition-colors rounded font-bold text-xs ${
              isSaving
                ? "bg-gray-600 text-gray-400"
                : "bg-[#34A853] text-white hover:bg-[#2a9040]"
            }`}
          >
            {isSaving ? "저장 중..." : "서버에 저장"}
          </button>

          <div className="w-px h-6 bg-[#475569] mx-1"></div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white hover:bg-blue-700 transition-colors rounded font-bold text-xs"
          >
            {isImporting ? "로드 중..." : "📂 로컬 JSON 추가"}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportJSON}
            accept=".json"
            className="hidden"
          />
        </div>

        <MapContainer
          center={initialCenter}
          zoom={initialZoom}
          minZoom={-4}
          maxZoom={5}
          crs={CRS.Simple}
          maxBounds={bounds}
          maxBoundsViscosity={1.0}
          style={{ height: "100%", width: "100%", background: "transparent" }}
        >
          {/* 🌟 URL 변경 시 화면을 이동시켜주는 컴포넌트 삽입 */}
          <MapController center={initialCenter} zoom={initialZoom} />

          <TileLayer
             key={activeMapId}
             url={`/tiles/${activeMapId}/{z}/{x}/{y}.jpg`}
             minZoom={-4}
             maxZoom={5}
             maxNativeZoom={0}
             zoomOffset={5}
             bounds={bounds}
             noWrap={true}
          />
          <MapEvents onClick={handleMapClick} />
          {visibleVehicles.map((vehicle) => (
            <Marker
              key={vehicle.id}
              position={[vehicle.y, vehicle.x]}
              draggable={true}
              icon={icons[vehicle.type] || icons["Esports"]}
              eventHandlers={{
                dragend: (e) => {
                  const marker = e.target;
                  const pos = marker.getLatLng();
                  updateVehiclePos(vehicle.id, pos.lat, pos.lng);
                },
                contextmenu: (e) => {
                  e.originalEvent.preventDefault();
                  e.originalEvent.stopPropagation();
                  removeVehicle(vehicle.id);
                },
                click: (e) => {
                  e.originalEvent.stopPropagation();
                },
              }}
            />
          ))}

          {pendingVehicles.map((v) => {
            const weight = v.weight || 1;
            const radius = 15 + weight * 4;
            const color = weight >= 5 ? "#ef4444" : "#f59e0b";
            return (
              <CircleMarker
                key={`pending-${v.id}`}
                center={[v.y, v.x]}
                radius={radius}
                color={color}
                fillColor={color}
                fillOpacity={0.4}
                weight={2}
                interactive={false}
              >
                <Tooltip direction="top" opacity={0.9} permanent>
                  👀제보: {v.marker_type}
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
};

export default MapEditorComponent;
