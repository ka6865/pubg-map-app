import React, { memo } from "react";
import Link from "next/link";
import NotificationDropdown from "./NotificationDropdown";
import type { MapTab, NotificationItem } from "../../types/map";

interface MapHeaderProps {
  activeMapId: string;
  isMobile: boolean;
  isAuthLoading: boolean;
  isAdmin: boolean;
  currentUser: any;
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
        {activeMapId !== "Stats" && activeMapId !== "Board" && (
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
            style={{ fontWeight: "bold", color: "rgba(0,0,0,0.5)", fontSize: "13px" }}
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
