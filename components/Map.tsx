"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import L from "leaflet";
import dynamic from "next/dynamic";

import { supabase } from "../lib/supabase";
import { CATEGORY_INFO } from "../lib/map_config";
import { useMapData } from "../hooks/useMapData";
import { useAuth } from "./AuthProvider";
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
    notifications,
    dbVehicles,
    pendingVehicles,
    isDataLoading,
    setOptimisticNickname,
    setNotifications,
    fetchUserProfile,
  } = useMapData(activeMapId, authUser);

  const isAuthLoading = authLoading || isDataLoading;
  const currentPostId = activePostId;

  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [showNotiDropdown, setShowNotiDropdown] = useState(false);
  // URL 쿼리 파라미터 mypage=1 여부로 마이페이지 초기 상태 결정
  const [isMyPage, setIsMyPage] = useState(() => searchParams?.get("mypage") === "1");
  const [isMobile, setIsMobile] = useState(false);

  // URL의 mypage 쿼리 파라미터가 바뀔 때마다 isMyPage 상태 동기화
  useEffect(() => {
    setIsMyPage(searchParams?.get("mypage") === "1");
  }, [searchParams]);

  const icons = useMemo(() => {
    const res: Record<string, L.DivIcon> = {};
    const scale = isMobile ? 1.25 : 1; // 모바일에서 마커 25% 확대
    Object.keys(CATEGORY_INFO).forEach((key) => {
      res[key] = createPinIcon(
        CATEGORY_INFO[key].color,
        CATEGORY_INFO[key].path,
        scale
      );
    });
    return res;
  }, [isMobile]);

  const [filters, setFilters] = useState<MapFilters>(() => {
    const init: Record<string, boolean> = { pending: false };
    if (typeof window !== "undefined" && sessionStorage.getItem("showPendingReports") === "true") {
      init.pending = true;
    }
    Object.keys(CATEGORY_INFO).forEach((k) => {
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
    // router.push로 URL이 바뀌면 useEffect가 isMyPage를 자동 동기화
    if (tabId === "Board") {
      router.push('/board'); // 게시판 이동 시 mypage 쿼리 없이 이동
    } else if (tabId === "Stats") {
      router.push('/stats');
    } else {
      router.push(`/maps/${tabId.toLowerCase()}`);
    }
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
    // router.push로 URL 변경 → useEffect가 isMyPage 자동 동기화
    router.push(`/board/${noti.post_id}`);
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
        onTabClick={handleTabClick}
        onToggleSidebar={() => setSidebarOpen(!isSidebarOpen)}
        onToggleNoti={() => setShowNotiDropdown(!showNotiDropdown)}
        onCloseNoti={() => setShowNotiDropdown(false)}
        onMarkAllAsRead={markAllAsRead}
        onNotiClick={handleNotiClick}
        onMyPageClick={() => {
          // /board 페이지로 이동하되 mypage=1 쿼리를 붙여 상태 유지
          router.push("/board?mypage=1");
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
              <StatSearch userProfile={userProfile} />
            </div>
          </div>
        ) : activeMapId === "Board" ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              overflowY: "auto",
              backgroundColor: "#121212",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                maxWidth: isMyPage ? "1300px" : "900px",
                margin: "0 auto",
                padding: isMobile ? "10px" : "20px",
              }}
            >
              {isMyPage ? (
                <MyPage
                  currentUser={currentUser}
                  userProfile={userProfile}
                  fetchUserProfile={fetchUserProfile}
                  setOptimisticNickname={setOptimisticNickname}
                />
              ) : (
                <Board
                  currentUser={currentUser}
                  displayName={displayName}
                  isAdmin={isAdmin}
                  postId={currentPostId || undefined}
                  initialIsWriting={initialIsWriting}
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
            onSetSidebarOpen={setSidebarOpen}
            onToggleFilter={toggleFilter}
            onGetCount={getCount}
            onEnableDefaultVehicleFilters={enableDefaultVehicleFilters}
            currentUser={currentUser}
            isAdmin={isAdmin}
            pendingVehicles={pendingVehicles} // 🌟 자식에게 제보 데이터 넘김
          />
        )}
      </main>
    </div>
  );
}
