"use client";

import { useRouter, useSearchParams } from "next/navigation"; // Next.js 라우터 관리 모듈
import { useState, useEffect, useMemo, memo } from "react"; // React 상태, 생명주기 및 렌더링 최적화 훅
import { MapContainer, ImageOverlay, Marker, Popup } from "react-leaflet"; // Leaflet 지도 렌더링 래퍼 컴포넌트 모음
import L, { CRS } from "leaflet"; // Leaflet 코어 객체 및 단순 좌표계 시스템
import "leaflet/dist/leaflet.css"; // Leaflet 코어 스타일시트
import Link from "next/link"; // Next.js 페이지 이동 링크 모듈
import dynamic from "next/dynamic"; // Next.js 동적 컴포넌트 로드 모듈
import { supabase } from "../lib/supabase"; // DB 통신용 Supabase 클라이언트
import { CATEGORY_INFO, MAP_CATEGORIES } from "../lib/map_config"; // 마커 카테고리 속성 및 맵별 허용 데이터 설정
import { LOCAL_MARKERS } from "../lib/local_data"; // 로컬 테스트용 고정 마커 배열
import Sidebar from "./Sidebar"; // 좌측 사이드바 제어 패널 컴포넌트
import StatSearch from "./StatSearch";

// 게시판 및 마이페이지 동적 로드 적용 (탭 선택 시에만 렌더링하여 초기 부하 감소)
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

// SVG 경로를 이용한 커스텀 마커 아이콘 생성 함수
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

const MAP_LIST = [
  { id: "Erangel", label: "에란겔", imageUrl: "/Erangel.jpg" },
  { id: "Miramar", label: "미라마", imageUrl: "/Miramar.jpg" },
  { id: "Taego", label: "태이고", imageUrl: "/Taego.jpg" },
  { id: "Rondo", label: "론도", imageUrl: "/Rondo.jpg" },
  { id: "Vikendi", label: "비켄디", imageUrl: "/Vikendi.jpg" },
  { id: "Deston", label: "데스턴", imageUrl: "/Deston.jpg" },
];

// 상위 UI 상태 변경 시 지도 객체 재렌더링 차단을 위한 메모이제이션 래퍼 컴포넌트
const MapView = memo(
  ({
    activeMapId,
    currentMap,
    bounds,
    visibleVehicles,
    icons,
    imageHeight,
    imageWidth,
  }: any) => {
    return (
      <MapContainer
        key={activeMapId}
        center={[imageHeight / 2, imageWidth / 2]}
        zoom={-3}
        minZoom={-4}
        maxZoom={2}
        crs={CRS.Simple}
        style={{ height: "100%", width: "100%", background: "#0b0f19" }}
        zoomControl={false}
      >
        {currentMap ? (
          <ImageOverlay url={currentMap.imageUrl} bounds={bounds} />
        ) : null}
        {visibleVehicles.map((v: any) => (
          <Marker
            key={v.id}
            position={[v.y, v.x]}
            icon={icons[v.type] || icons["Esports"]}
          >
            <Popup>{v.name}</Popup>
          </Marker>
        ))}
      </MapContainer>
    );
  }
);
MapView.displayName = "MapView";

// 메인 지도 화면 레이아웃 및 탭 상태 제어 루트 컴포넌트
export default function Map() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeMapId = searchParams?.get("tab") || "Erangel";

  const [isSidebarOpen, setSidebarOpen] = useState(true); // 사이드바 열림/닫힘 상태
  const [showNotiDropdown, setShowNotiDropdown] = useState(false); // 알림 드롭다운 표시 여부 상태
  const [isMyPage, setIsMyPage] = useState(false); // 마이페이지 활성화 여부 상태
  const [isMobile, setIsMobile] = useState(false); // 모바일 화면 여부 상태
  const [isAuthLoading, setIsAuthLoading] = useState(true); // 인증 상태 로딩 여부

  const [currentUser, setCurrentUser] = useState<any>(null); // 현재 로그인된 사용자 객체
  const [userProfile, setUserProfile] = useState<any>(null); // 사용자 프로필 정보 (닉네임 등)
  const [optimisticNickname, setOptimisticNickname] = useState<string | null>(
    null
  ); // 닉네임 변경 즉시 반영을 위한 낙관적 상태
  const [notifications, setNotifications] = useState<any[]>([]); // 알림 목록 데이터

  // 카테고리 정보 기반 지도 렌더링용 아이콘 사전 생성
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

  const [filters, setFilters] = useState<{ [key: string]: boolean }>(() => {
    // 지도 마커 필터링 상태 (카테고리별 ON/OFF)
    const init: Record<string, boolean> = {};
    Object.keys(CATEGORY_INFO).forEach((k) => (init[k] = false));
    init["Esports"] = true;
    init["Garage"] = true;
    return init;
  });

  const [dbVehicles, setDbVehicles] = useState<any[]>([]); // DB에서 가져온 차량/마커 데이터 목록

  // 브라우저 해상도 변화 감지 후 모바일 화면 대응 상태 적용
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    if (window.innerWidth < 768) setSidebarOpen(false);
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // 화면에 표시할 사용자 이름 (낙관적 닉네임 우선)
  const displayName = useMemo(
    () => optimisticNickname || userProfile?.nickname || "익명",
    [optimisticNickname, userProfile]
  );
  // 관리자 권한 보유 여부 확인
  const isAdmin = userProfile?.role === "admin";

  // 사이드바 내 개별 필터 항목 활성화 상태 반전
  const toggleFilter = (id: string) =>
    setFilters((prev) => ({ ...prev, [id]: !prev[id] }));

  // 맵 내 지정된 카테고리의 마커 개수 산출
  const getCount = (type: string) =>
    dbVehicles.filter((v) => v.mapId === activeMapId && v.type === type).length;

  // Supabase 세션 확인 및 로그인 상태 실시간 갱신 리스너 등록
  useEffect(() => {
    const initAuthAndMap = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUser(session.user);
        await fetchUserProfile(session.user);
        fetchNotifications(session.user.id);
      }
      setIsAuthLoading(false);

      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          setCurrentUser(session.user);
          await fetchUserProfile(session.user);
        } else {
          setCurrentUser(null);
          setUserProfile(null);
          setOptimisticNickname(null);
        }
      });
    };
    initAuthAndMap();
  }, []);

  // 선택 맵 전환 시 해당 맵 소속 DB 마커 및 로컬 데이터 취합 로드
  useEffect(() => {
    const fetchMarkers = async () => {
      if (activeMapId === "Board") return;
      const { data } = await supabase
        .from("map_markers")
        .select("*")
        .eq("map_id", activeMapId);

      let combined = data ? data.map((m) => ({ ...m, mapId: m.map_id })) : [];
      LOCAL_MARKERS.forEach((lm) => {
        if (lm.mapId === activeMapId && !combined.find((v) => v.id === lm.id)) {
          combined.push(lm);
        }
      });
      setDbVehicles(combined);
    };
    fetchMarkers();
  }, [activeMapId]);

  // 필터가 켜진 속성의 차량 마커만 지도 노출 대상으로 추출
  const visibleVehicles = useMemo(
    () => dbVehicles.filter((v) => filters[v.type]),
    [dbVehicles, filters]
  );

  // 현재 사용자 프로필 데이터베이스 조회 또는 최초 로그인 시 임시 생성
  const fetchUserProfile = async (user: any) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (data) {
      setUserProfile(data);
    } else {
      const emailPrefix = user.email?.split("@")[0] || "익명";
      await supabase
        .from("profiles")
        .insert([{ id: user.id, nickname: emailPrefix }]);
      setUserProfile({ nickname: emailPrefix });
    }
  };

  // 사용자 수신 알림 내역 최신순 정렬 로드
  const fetchNotifications = async (userId: string) => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (data) setNotifications(data);
  };

  // 상단 네비게이션 탭 클릭 시 파라미터 업데이트 라우팅 수행
  const handleTabClick = (tabId: string) => {
    setIsMyPage(false);
    router.push(`/?tab=${tabId}`);
  };

  // 알림 등 타임스탬프를 직관적 시간 문자열로 변환 포맷팅
  const formatNotiTime = (dateString: string) => {
    const diff = (new Date().getTime() - new Date(dateString).getTime()) / 1000;
    if (diff < 60) return "방금 전";
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
    return new Date(dateString).toLocaleDateString();
  };

  // 개별 알림 클릭 시 읽음 상태로 변경 및 해당 게시물 화면으로 연결
  const handleNotiClick = async (noti: any) => {
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

  // 모든 미확인 알림 일괄 읽음 상태 업데이트
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
  const imageWidth = 8192;
  const imageHeight = 8192;
  const bounds: [[number, number], [number, number]] = [
    [0, 0],
    [imageHeight, imageWidth],
  ];

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
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "50px",
          padding: "0 10px",
          backgroundColor: "#F2A900",
          borderBottom: "2px solid #cc8b00",
          zIndex: 6000,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flex: 1,
            overflow: "hidden",
          }}
        >
          {activeMapId !== "Stats" && activeMapId !== "Board" && (
            <button
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              style={{
                background: "none",
                border: "none",
                color: "white",
                fontSize: "24px",
                cursor: "pointer",
                padding: "0 10px",
                display: "flex",
                alignItems: "center",
              }}
            >
              ☰
            </button>
          )}
          <div
            onClick={() => handleTabClick("Erangel")}
            style={{
              fontSize: isMobile ? "16px" : "20px",
              fontWeight: "900",
              fontStyle: "italic",
              color: "black",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            PUBG<span style={{ color: "white" }}>MAP</span>
          </div>
          <nav
            style={{
              display: "flex",
              gap: "4px",
              overflowX: "auto",
              scrollbarWidth: "none",
              alignItems: "center",
              msOverflowStyle: "none",
            }}
          >
            {MAP_LIST.map((m) => (
              <button
                key={m.id}
                onClick={() => handleTabClick(m.id)}
                style={{
                  height: "30px",
                  padding: "0 8px",
                  borderRadius: "4px",
                  fontWeight: "bold",
                  fontSize: "12px",
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  backgroundColor:
                    activeMapId === m.id ? "#1a1a1a" : "transparent",
                  color: activeMapId === m.id ? "white" : "black",
                }}
              >
                {m.label}
              </button>
            ))}
            <div
              style={{
                width: "2px",
                height: "16px",
                backgroundColor: "rgba(0,0,0,0.3)",
                margin: "0 4px",
                borderRadius: "2px",
              }}
            />
            <button
              onClick={() => handleTabClick("Board")}
              style={{
                height: "30px",
                padding: "0 8px",
                borderRadius: "4px",
                fontWeight: "bold",
                fontSize: "12px",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                backgroundColor:
                  activeMapId === "Board" ? "#1a1a1a" : "transparent",
                color: activeMapId === "Board" ? "#F2A900" : "black",
              }}
            >
              게시판
            </button>
            <button
              onClick={() => handleTabClick("Stats")}
              style={{
                height: "30px",
                padding: "0 8px",
                borderRadius: "4px",
                fontWeight: "bold",
                fontSize: "12px",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                backgroundColor:
                  activeMapId === "Stats" ? "#1a1a1a" : "transparent",
                color: activeMapId === "Stats" ? "#F2A900" : "black",
              }}
            >
              전적검색
            </button>
          </nav>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexShrink: 0,
          }}
        >
          {isAuthLoading ? (
            <span
              style={{
                fontWeight: "bold",
                color: "rgba(0,0,0,0.5)",
                fontSize: "13px",
              }}
            >
              정보 확인 중...
            </span>
          ) : currentUser ? (
            <>
              {isAdmin && (
                <Link href="/map-editor" style={{ textDecoration: "none" }}>
                  <button
                    style={{
                      marginRight: "10px",
                      padding: "6px 12px",
                      backgroundColor: "#1a1a1a",
                      color: "#F2A900",
                      border: "1px solid #333",
                      borderRadius: "4px",
                      fontWeight: "bold",
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                  >
                    관리자페이지
                  </button>
                </Link>
              )}

              <div style={{ position: "relative" }}>
                <div
                  onClick={() => setShowNotiDropdown(!showNotiDropdown)}
                  style={{
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="black">
                    <path d={svgPaths.bell} />
                  </svg>
                  {notifications.some((n) => !n.is_read) ? (
                    <span
                      style={{
                        position: "absolute",
                        top: "-2px",
                        right: "-2px",
                        width: "8px",
                        height: "8px",
                        backgroundColor: "red",
                        borderRadius: "50%",
                      }}
                    ></span>
                  ) : null}
                </div>

                {showNotiDropdown && (
                  <div
                    style={{
                      position: "fixed",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      zIndex: 6999,
                    }}
                    onClick={() => setShowNotiDropdown(false)}
                  />
                )}

                {showNotiDropdown && (
                  <div
                    style={{
                      position: "absolute",
                      top: "30px",
                      right: "-10px",
                      width: "280px",
                      backgroundColor: "#1a1a1a",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                      zIndex: 7000,
                      display: "flex",
                      flexDirection: "column",
                      maxHeight: "350px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "12px 15px",
                        borderBottom: "1px solid #333",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        backgroundColor: "#252525",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: "bold",
                          fontSize: "13px",
                          color: "#F2A900",
                        }}
                      >
                        알림 내역
                      </span>
                      {notifications.some((n) => !n.is_read) && (
                        <button
                          onClick={markAllAsRead}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#aaa",
                            fontSize: "11px",
                            cursor: "pointer",
                            fontWeight: "bold",
                          }}
                        >
                          모두 읽음
                        </button>
                      )}
                    </div>

                    <div
                      style={{
                        overflowY: "auto",
                        flex: 1,
                        backgroundColor: "#1a1a1a",
                      }}
                    >
                      {notifications.length === 0 ? (
                        <div
                          style={{
                            padding: "30px 20px",
                            textAlign: "center",
                            color: "#666",
                            fontSize: "12px",
                          }}
                        >
                          새로운 알림이 없습니다.
                        </div>
                      ) : (
                        notifications.map((noti) => (
                          <div
                            key={noti.id}
                            onClick={() => handleNotiClick(noti)}
                            style={{
                              padding: "12px 15px",
                              borderBottom: "1px solid #222",
                              cursor: "pointer",
                              backgroundColor: noti.is_read
                                ? "transparent"
                                : "rgba(242, 169, 0, 0.08)",
                              transition: "background-color 0.2s",
                              display: "flex",
                              flexDirection: "column",
                              gap: "6px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                gap: "8px",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "13px",
                                  color: noti.is_read ? "#777" : "#fff",
                                  lineHeight: "1.4",
                                  flex: 1,
                                  wordBreak: "keep-all",
                                }}
                              >
                                <strong
                                  style={{
                                    color: noti.is_read ? "#888" : "#F2A900",
                                  }}
                                >
                                  {noti.sender_name}
                                </strong>
                                님이{" "}
                                {noti.type === "reply"
                                  ? " 내 댓글에 답글을 남겼습니다."
                                  : " 내 글에 댓글을 남겼습니다."}
                              </div>
                              {noti.preview_text && (
                                <div
                                  style={{
                                    maxWidth: "90px",
                                    fontSize: "11px",
                                    color: noti.is_read ? "#555" : "#aaa",
                                    backgroundColor: noti.is_read
                                      ? "transparent"
                                      : "rgba(255,255,255,0.05)",
                                    padding: "4px 6px",
                                    borderRadius: "4px",
                                    border: "1px solid #333",
                                    flexShrink: 0,
                                    lineHeight: "1.4",
                                    display: "-webkit-box",
                                    WebkitBoxOrient: "vertical",
                                    WebkitLineClamp: 2,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "normal",
                                  }}
                                >
                                  {noti.preview_text}
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize: "11px", color: "#555" }}>
                              {formatNotiTime(noti.created_at)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div
                onClick={() => {
                  setIsMyPage(true);
                  router.push("/?tab=Board");
                }}
                style={{
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(255,255,255,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="black">
                    <path d={svgPaths.user} />
                  </svg>
                </div>
                {!isMobile ? (
                  <span
                    style={{
                      fontWeight: "bold",
                      color: "black",
                      fontSize: "13px",
                    }}
                  >
                    {displayName}
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <Link
              href="/login"
              style={{
                textDecoration: "none",
                fontWeight: "bold",
                color: "black",
                fontSize: "12px",
                backgroundColor: "white",
                padding: "5px 10px",
                borderRadius: "4px",
                border: "1px solid rgba(0,0,0,0.1)",
              }}
            >
              로그인
            </Link>
          )}
        </div>
      </header>
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
          <>
            {/* 모바일 환경에서 사이드바가 열려있을 때 바깥 영역 터치 시 닫히도록 오버레이 추가 */}
            {isMobile && isSidebarOpen && (
              <div
                onClick={() => setSidebarOpen(false)}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(0,0,0,0.5)",
                  zIndex: 5499,
                }}
              />
            )}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                zIndex: 5500,
                display: isSidebarOpen ? "flex" : "none",
                width: "260px",
                backgroundColor: "#1a1a1a",
                borderRight: "1px solid #333",
              }}
            >
              <Sidebar
                isOpen={isSidebarOpen}
                setIsOpen={setSidebarOpen}
                mapLabel={currentMap?.label || ""}
                activeMapId={activeMapId}
                filters={filters}
                toggleFilter={toggleFilter}
                getCount={getCount}
              />
            </div>

            <div style={{ flex: 1, position: "relative" }}>
              <MapView
                activeMapId={activeMapId}
                currentMap={currentMap}
                bounds={bounds}
                visibleVehicles={visibleVehicles}
                icons={icons}
                imageHeight={imageHeight}
                imageWidth={imageWidth}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
