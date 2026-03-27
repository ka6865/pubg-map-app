"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import L from "leaflet";
import dynamic from "next/dynamic";

import { supabase } from "../lib/supabase";
import { CATEGORY_INFO } from "../lib/map_config";
import { useMapData } from "../hooks/useMapData";
import MapHeader from "./map/MapHeader";
import MapShell from "./map/MapShell";
import StatSearch from "./StatSearch";
import type { MapFilters, MapTab, NotificationItem } from "../types/map";

const Board = dynamic(() => import("./Board"), {
  loading: () => (
    <div style={{ color: "white", padding: "20px" }}>게시판 불러오는 중...</div>
  ),
});
const MyPage = dynamic(() => import("./MyPage"), {
  loading: () => (
    <div style={{ color: "white", padding: "20px" }}>
      마이페이지 불러오는 중...
    </div>
  ),
});

const svgPaths = {
  bell: "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
  user: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
};

const createPinIcon = (colorCode: string, pathData: string) => {
  return L.divIcon({
    className: "custom-pin-icon",
    html: `
      <div style="position: relative; width: 28px; height: 38px;">
        <svg viewBox="0 0 30 42" style="width: 100%; height: 100%; filter: drop-shadow(0 3px 4px rgba(0,0,0,0.8));">
          <path d="M15 0C6.7 0 0 6.7 0 15c0 8.3 15 27 15 27s15-18.7 15-27C30 6.7 23.3 0 15 0z" fill="${colorCode}" stroke="#ffffff" stroke-width="2"/>
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

const MAP_LIST: MapTab[] = [
  { id: "Erangel", label: "에란겔", imageUrl: "/Erangel.jpg" },
  { id: "Miramar", label: "미라마", imageUrl: "/Miramar.jpg" },
  { id: "Taego", label: "태이고", imageUrl: "/Taego.jpg" },
  { id: "Rondo", label: "론도", imageUrl: "/Rondo.jpg" },
  { id: "Vikendi", label: "비켄디", imageUrl: "/Vikendi.jpg" },
  { id: "Deston", label: "데스턴", imageUrl: "/Deston.jpg" },
];

export default function Map() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeMapId = searchParams?.get("tab") || "Erangel";

  const {
    currentUser,
    userProfile,
    optimisticNickname,
    notifications,
    dbVehicles,
    pendingVehicles, // 🌟 제보 데이터 로드
    isAuthLoading,
    setOptimisticNickname,
    setNotifications,
    fetchUserProfile,
  } = useMapData(activeMapId);

  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [showNotiDropdown, setShowNotiDropdown] = useState(false);
  const [isMyPage, setIsMyPage] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const icons = useMemo(() => {
    const res: Record<string, L.DivIcon> = {};
    Object.keys(CATEGORY_INFO).forEach((key) => {
      res[key] = createPinIcon(
        CATEGORY_INFO[key].color,
        CATEGORY_INFO[key].path
      );
    });
    return res;
  }, []);

  const [filters, setFilters] = useState<MapFilters>(() => {
    const init: Record<string, boolean> = { pending: false }; //
    Object.keys(CATEGORY_INFO).forEach((k) => (init[k] = false));
    return init;
  });

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
    setIsMyPage(false);
    router.push(`/?tab=${tabId}`);
  };

  const formatNotiTime = (dateString: string) => {
    const diff = (new Date().getTime() - new Date(dateString).getTime()) / 1000;
    if (diff < 60) return "방금 전";
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
    return new Date(dateString).toLocaleDateString();
  };

  const handleNotiClick = async (noti: NotificationItem) => {
    if (!noti.is_read) {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", noti.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === noti.id ? { ...n, is_read: true } : n))
      );
    }
    setShowNotiDropdown(false);
    setIsMyPage(false);
    router.push(`/?tab=Board&postId=${noti.post_id}`);
  };

  const markAllAsRead = async () => {
    if (!currentUser) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", currentUser.id)
      .eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
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
        height: "100dvh",
        fontFamily: "'Pretendard', sans-serif",
        overflow: "hidden",
        backgroundColor: "#121212",
        color: "white",
      }}
    >
      <MapHeader
        activeMapId={activeMapId}
        isMobile={isMobile}
        isAuthLoading={isAuthLoading}
        isAdmin={isAdmin}
        currentUser={currentUser}
        notifications={notifications}
        showNotiDropdown={showNotiDropdown}
        displayName={displayName}
        mapList={MAP_LIST}
        svgPaths={svgPaths}
        onTabClick={handleTabClick}
        onToggleSidebar={() => setSidebarOpen(!isSidebarOpen)}
        onToggleNoti={() => setShowNotiDropdown(!showNotiDropdown)}
        onCloseNoti={() => setShowNotiDropdown(false)}
        onMarkAllAsRead={markAllAsRead}
        onNotiClick={handleNotiClick}
        onMyPageClick={() => {
          setIsMyPage(true);
          router.push("/?tab=Board");
        }}
        formatNotiTime={formatNotiTime}
      />

      <main
        style={{
          flex: 1,
          display: "flex",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {activeMapId === "Stats" ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              overflowY: "auto",
              backgroundColor: "#0d0d0d",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div style={{ width: "100%", maxWidth: "1200px" }}>
              <StatSearch />
            </div>
          </div>
        ) : activeMapId === "Board" ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              overflowY: "auto",
              backgroundColor: "#0d0d0d",
            }}
          >
            <div
              style={{
                maxWidth: "900px",
                margin: "0 auto",
                padding: isMobile ? "10px" : "20px",
              }}
            >
              {isMyPage ? (
                <MyPage
                  currentUser={currentUser}
                  userProfile={userProfile}
                  setIsMyPage={setIsMyPage}
                  fetchUserProfile={fetchUserProfile}
                  setOptimisticNickname={setOptimisticNickname}
                />
              ) : (
                <Board
                  currentUser={currentUser}
                  displayName={displayName}
                  isAdmin={isAdmin}
                />
              )}
            </div>
          </div>
        ) : (
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
            onCloseSidebar={() => setSidebarOpen(false)}
            onSetSidebarOpen={setSidebarOpen}
            onToggleFilter={toggleFilter}
            onGetCount={getCount}
            onEnableDefaultVehicleFilters={enableDefaultVehicleFilters}
            currentUser={currentUser}
            pendingVehicles={pendingVehicles} // 🌟 자식에게 제보 데이터 넘김
          />
        )}
      </main>
    </div>
  );
}
