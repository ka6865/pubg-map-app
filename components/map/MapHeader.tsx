import React, { memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NotificationDropdown from "./NotificationDropdown";
import type { MapTab, NotificationItem, CurrentUser } from "../../types/map";

interface MapHeaderProps {
  activeMapId: string;
  isMobile: boolean;
  isAuthLoading: boolean;
  isAdmin: boolean;
  currentUser: CurrentUser | null;
  notifications: NotificationItem[];
  showNotiDropdown: boolean;
  displayName: string;
  mapList: MapTab[];
  svgPaths: { bell: string; user: string };
  onTabClick: (id: string) => void;
  onToggleSidebar: () => void;
  onToggleNoti: () => void;
  onCloseNoti: () => void;
  onMarkAllAsRead: () => void;
  onNotiClick: (noti: NotificationItem) => void;
  onMyPageClick: () => void;
  formatNotiTime: (date: string) => string;
}

const MapHeader = memo(({
  activeMapId,
  isMobile,
  isAuthLoading,
  isAdmin,
  currentUser,
  notifications,
  showNotiDropdown,
  displayName,
  mapList,
  svgPaths,
  onTabClick,
  onToggleSidebar,
  onToggleNoti,
  onCloseNoti,
  onMarkAllAsRead,
  onNotiClick,
  onMyPageClick,
  formatNotiTime,
}: MapHeaderProps) => {
  const pathname = usePathname();
  const isWeaponsActive = pathname === "/weapons";
  const isBackpackActive = pathname === "/backpack";

  return (
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
        {activeMapId !== "Stats" && activeMapId !== "Board" && !isMobile && (
          <button
            onClick={onToggleSidebar}
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
          onClick={() => onTabClick("Erangel")}
          style={{
            fontSize: isMobile ? "18px" : "20px",
            fontWeight: "900",
            fontStyle: "italic",
            color: "black",
            cursor: "pointer",
            flexShrink: 0,
            letterSpacing: "-1px"
          }}
        >
          BG<span style={{ color: "white" }}>MAP.kr</span>
        </div>
        
        {!isMobile && (
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
            {mapList.map((m) => (
              <button
                key={m.id}
                onClick={() => onTabClick(m.id)}
                style={{
                  height: "30px",
                  padding: "0 8px",
                  borderRadius: "4px",
                  fontWeight: "bold",
                  fontSize: "12px",
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  backgroundColor: activeMapId === m.id ? "#1a1a1a" : "transparent",
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
              onClick={() => onTabClick("Board")}
              style={{
                height: "30px",
                padding: "0 8px",
                borderRadius: "4px",
                fontWeight: "bold",
                fontSize: "12px",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                backgroundColor: activeMapId === "Board" ? "#1a1a1a" : "transparent",
                color: activeMapId === "Board" ? "#F2A900" : "black",
              }}
            >
              게시판
            </button>
            <button
              onClick={() => onTabClick("Stats")}
              style={{
                height: "30px",
                padding: "0 8px",
                borderRadius: "4px",
                fontWeight: "bold",
                fontSize: "12px",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                backgroundColor: activeMapId === "Stats" ? "#1a1a1a" : "transparent",
                color: activeMapId === "Stats" ? "#F2A900" : "black",
              }}
            >
              전적검색
            </button>
            <Link href="/weapons" style={{ textDecoration: "none" }}>
              <button
                style={{
                  height: "30px",
                  padding: "0 8px",
                  borderRadius: "4px",
                  fontWeight: "bold",
                  fontSize: "12px",
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  backgroundColor: isWeaponsActive ? "#1a1a1a" : "transparent",
                  color: isWeaponsActive ? "#F2A900" : "black",
                }}
              >
                무기 도감
              </button>
            </Link>
            <Link href="/backpack" style={{ textDecoration: "none" }}>
              <button
                style={{
                  height: "30px",
                  padding: "0 8px",
                  borderRadius: "4px",
                  fontWeight: "bold",
                  fontSize: "12px",
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  backgroundColor: isBackpackActive ? "#1a1a1a" : "transparent",
                  color: isBackpackActive ? "#F2A900" : "black",
                }}
              >
                가방 시뮬
              </button>
            </Link>

            {/* 구분선 */}
            <div
              style={{
                width: "1px",
                height: "16px",
                backgroundColor: "rgba(0,0,0,0.1)",
                margin: "0 4px",
                borderRadius: "1px",
              }}
            />

            {/* 디스코드 참여 링크 */}
            <a 
              href="https://discord.gg/T97MR78awb" 
              target="_blank" 
              rel="noopener noreferrer" 
              style={{ textDecoration: "none", display: "flex", alignItems: "center" }}
            >
              <button
                style={{
                  height: "30px",
                  padding: "0 10px",
                  borderRadius: "4px",
                  fontWeight: "bold",
                  fontSize: "12px",
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  backgroundColor: "rgba(88, 101, 242, 0.1)",
                  color: "#5865F2",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                className="hover:bg-[#5865F2]/20 transition-colors"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
                </svg>
                Discord
              </button>
            </a>

            {/* 개발자 후원 (구상 중 - 비활성화)
            <button
              disabled
              style={{
                height: "30px",
                padding: "0 10px",
                borderRadius: "4px",
                fontWeight: "bold",
                fontSize: "12px",
                border: "none",
                cursor: "not-allowed",
                whiteSpace: "nowrap",
                backgroundColor: "transparent",
                color: "rgba(0,0,0,0.3)",
                display: "flex",
                alignItems: "center",
              }}
              title="추후 기능 구상 중입니다."
            >
              ☕ 후원하기
            </button>
            */}
          </nav>
        )}
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
            style={{ fontWeight: "bold", color: "rgba(0,0,0,0.5)", fontSize: "13px" }}
          >
            정보 확인 중...
          </span>
        ) : currentUser ? (
          <>
            {isAdmin && (
              <div className="flex gap-2 mr-[10px]">
                <Link href="/map-editor" style={{ textDecoration: "none" }}>
                  <button
                    style={{
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
                    맵 에디터
                  </button>
                </Link>
                <Link href="/admin/game-data" style={{ textDecoration: "none" }}>
                  <button
                    style={{
                      padding: "6px 12px",
                      backgroundColor: "#34A853",
                      color: "white",
                      border: "1px solid #2d8a46",
                      borderRadius: "4px",
                      fontWeight: "bold",
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                  >
                    데이터 관리
                  </button>
                </Link>
              </div>
            )}

            <div style={{ position: "relative" }}>
              <div
                onClick={onToggleNoti}
                style={{ cursor: "pointer", display: "flex", alignItems: "center" }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="black">
                  <path d={svgPaths.bell} />
                </svg>
                {notifications.some((n) => !n.is_read) && (
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
                  />
                )}
              </div>

              <NotificationDropdown
                notifications={notifications}
                isOpen={showNotiDropdown}
                onClose={onCloseNoti}
                onMarkAllAsRead={onMarkAllAsRead}
                onNotificationClick={onNotiClick}
                formatNotiTime={formatNotiTime}
              />
            </div>

            <div
              onClick={onMyPageClick}
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
              {!isMobile && (
                <span style={{ fontWeight: "bold", color: "black", fontSize: "13px" }}>
                  {displayName}
                </span>
              )}
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
  );
});

MapHeader.displayName = "MapHeader";
export default MapHeader;
