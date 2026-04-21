"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import L from "leaflet";


import { CATEGORY_INFO } from "../lib/map_config";
import { useMapSettings } from "../hooks/useMapSettings";
import { useMapData } from "../hooks/useMapData";
import { useAuth } from "./AuthProvider";
import MapShell from "./map/MapShell";
import type { MapFilters, MapTab } from "../types/map";

const createPinIcon = (colorCode: string, pathData: string, scale: number = 1) => {
  const width = 28 * scale;
  const height = 38 * scale;
  const iconWidth = 16 * scale;
  const iconHeight = 16 * scale;
  const innerTopOffset = 26 * (height / 38);

  return L.divIcon({
    className: "custom-pin-icon",
    html: `
      <div style="position: relative; width: ${width}px; height: ${height}px;">
        <svg viewBox="0 0 30 42" style="width: 100%; height: 100%; filter: drop-shadow(0 3px 4px rgba(0,0,0,0.8));">
          <path d="M15 0C6.7 0 0 6.7 0 15c0 8.3 15 27 15 27s15-18.7 15-27C30 6.7 23.3 0 15 0z" fill="${colorCode}" stroke="#ffffff" stroke-width="2"/>
        </svg>
        <div style="position: absolute; top: 0; left: 0; width: 100%; height: ${innerTopOffset}px; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" style="width: ${iconWidth}px; height: ${iconHeight}px; fill: white;">
            <path d="${pathData}"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [width, height],
    iconAnchor: [width / 2, height],
  });
};

const MAP_LIST: MapTab[] = [
  { id: "Erangel", label: "에란겔", imageUrl: "/Erangel.jpg" },
  { id: "Miramar", label: "미라마", imageUrl: "/Miramar.jpg" },
  { id: "Taego", label: "태이고", imageUrl: "/Taego.jpg" },
  { id: "Rondo", label: "론도", imageUrl: "/Rondo.jpg" },
  { id: "Vikendi", label: "비켄디", imageUrl: "/Vikendi.jpg" },
  { id: "Deston", label: "데스턴", imageUrl: "/Deston.jpg" },
];

interface MapProps {
  initialMapId?: string;
  postId?: string;
  initialIsWriting?: boolean;
}

export default function Map({ initialMapId, postId, initialIsWriting }: MapProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeMapId = initialMapId || searchParams?.get("tab") || "Erangel";
  const activePostId = postId || searchParams?.get("postId");
  const { user: authUser, loading: authLoading } = useAuth();

  const {
    currentUser,
    userProfile,
    optimisticNickname,
    dbVehicles,
    pendingVehicles,
    isDataLoading,
    setOptimisticNickname,
    fetchUserProfile,
  } = useMapData(activeMapId, authUser);

  const isAuthLoading = authLoading || isDataLoading;
  const currentPostId = activePostId;

  const [isSidebarOpen, setSidebarOpen] = useState(true);
  // URL 쿼리 파라미터 mypage=1 여부로 마이페이지 여부 결정
  const isMyPage = searchParams?.get("mypage") === "1";
  const [isMobile, setIsMobile] = useState(false);

  // DB 기반 카테고리 마스터 정보 로드
  const { categoryInfoMap } = useMapSettings(activeMapId);

  const icons = useMemo(() => {
    const res: Record<string, L.DivIcon> = {};
    const scale = isMobile ? 1.25 : 1; // 모바일에서 마커 25% 확대
    // DB 카테고리 우선, 없으면 하드코딩 기본값 사용
    const infoSource = Object.keys(categoryInfoMap).length > 0 ? categoryInfoMap : CATEGORY_INFO;
    Object.keys(infoSource).forEach((key) => {
      res[key] = createPinIcon(
        infoSource[key].color,
        infoSource[key].path,
        scale
      );
    });
    return res;
  }, [isMobile, categoryInfoMap]);

  const [filters, setFilters] = useState<MapFilters>(() => {
    const init: Record<string, boolean> = { pending: false };
    if (typeof window !== "undefined" && sessionStorage.getItem("showPendingReports") === "true") {
      init.pending = true;
    }
    // DB 카테고리 우선, 없으면 CATEGORY_INFO 기본값 사용
    const infoSource = Object.keys(categoryInfoMap).length > 0 ? categoryInfoMap : CATEGORY_INFO;
    Object.keys(infoSource).forEach((k) => {
      if (!init.hasOwnProperty(k)) init[k] = false;
    });
    return init;
  });

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("showPendingReports") === "true") {
      sessionStorage.removeItem("showPendingReports");
    }
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const displayName = useMemo(
    () => optimisticNickname || userProfile?.nickname || "익명",
    [optimisticNickname, userProfile]
  );
  const isAdmin = userProfile?.role === "admin";

  const toggleFilter = (id: string) =>
    setFilters((prev) => ({ ...prev, [id]: !prev[id] }));

  const getCount = (type: string) =>
    dbVehicles.filter((v) => v.mapId === activeMapId && v.type === type).length;

  const enableDefaultVehicleFilters = () => {
    setFilters((prev) => ({ ...prev, Esports: true, Garage: true }));
  };

  const handleTabClick = (tabId: string) => {
    if (tabId === "Board") {
      router.push('/board');
    } else if (tabId === "Stats") {
      router.push('/stats');
    } else {
      router.push(`/maps/${tabId.toLowerCase()}`);
    }
  };



  const currentMap = MAP_LIST.find((m) => m.id === activeMapId) || MAP_LIST[0];
  const bounds: [[number, number], [number, number]] = [
    [0, 0],
    [8192, 8192],
  ];

  const visibleVehicles = useMemo(
    () => dbVehicles.filter((v) => filters[v.type]),
    [dbVehicles, filters]
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%", /* 100dvh에서 100%로 변경 (부모인 main이 flex-grow를 가지므로) */
        fontFamily: "'Pretendard', sans-serif",
        overflow: "hidden",
        backgroundColor: "#121212",
        color: "white",
      }}
    >
      <main
        style={{
          flex: 1,
          display: "flex",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <MapShell
          isMobile={isMobile}
          isSidebarOpen={isSidebarOpen}
          activeMapId={activeMapId}
          currentMap={currentMap}
          filters={filters}
          visibleVehicles={visibleVehicles}
          bounds={bounds}
          icons={icons}
          imageHeight={8192}
          imageWidth={8192}
          onSetSidebarOpen={setSidebarOpen}
          onToggleFilter={toggleFilter}
          onGetCount={getCount}
          onEnableDefaultVehicleFilters={enableDefaultVehicleFilters}
          currentUser={currentUser}
          isAdmin={isAdmin}
          pendingVehicles={pendingVehicles}
        />
      </main>
    </div>
  );
}
