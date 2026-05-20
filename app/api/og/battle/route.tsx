// app/api/og/battle/route.tsx
// 전적비교배틀 OG 이미지 API Route — 개선된 레이아웃
// /api/og/battle?nick1=AAA&nick2=BBB 로 호출하면 1200×630 PNG를 반환합니다.

import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const nick1 = searchParams.get("nick1") || "플레이어1";
  const nick2 = searchParams.get("nick2") || "플레이어2";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "#080810",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
          fontFamily: "sans-serif",
        }}
      >
        {/* 왼쪽 인디고 그라디언트 */}
        <div style={{ position: "absolute", top: 0, left: 0, width: "520px", height: "630px", background: "linear-gradient(120deg, #3730a330 0%, transparent 70%)" }} />
        {/* 오른쪽 로즈 그라디언트 */}
        <div style={{ position: "absolute", top: 0, right: 0, width: "520px", height: "630px", background: "linear-gradient(240deg, #f43f5e30 0%, transparent 70%)" }} />
        {/* 중앙 어두운 오버레이 */}
        <div style={{ position: "absolute", top: 0, left: "400px", width: "400px", height: "630px", background: "linear-gradient(90deg, transparent, #080810 30%, #080810 70%, transparent)" }} />

        {/* 상단 BGMS 브랜드 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 48px 0", gap: "14px" }}>
          <div style={{ fontSize: "22px", fontWeight: "900", color: "#f59e0b" }}>🏆 BGMS</div>
          <div style={{ fontSize: "11px", color: "#4b5563", fontWeight: "800", letterSpacing: "3px", paddingLeft: "14px", borderLeft: "1px solid #1f2937" }}>
            전적 비교 배틀
          </div>
        </div>

        {/* 메인 VS 영역 */}
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", padding: "0 56px" }}>

          {/* 플레이어 1 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", flex: 1, gap: "16px" }}>
            <div style={{ fontSize: "10px", fontWeight: "900", color: "#818cf8", letterSpacing: "4px" }}>PLAYER 1</div>
            <div
              style={{
                fontSize: nick1.length > 14 ? "38px" : "50px",
                fontWeight: "900",
                color: "#e0e7ff",
                letterSpacing: "-2px",
                lineHeight: "1.05",
              }}
            >
              {nick1}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {["AI 전술 분석", "2D 리플레이", "티어 평가"].map((feat, i) => (
                <div key={feat} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#6366f1" }} />
                  <span style={{ fontSize: "12px", color: "#6366f1", fontWeight: "700", opacity: 1 - i * 0.2 }}>{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* VS 중앙 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", minWidth: "180px" }}>
            <div style={{ width: "1px", height: "100px", background: "linear-gradient(180deg, transparent, #374151)" }} />
            <div style={{ fontSize: "64px", fontWeight: "900", color: "#1f2937", letterSpacing: "-4px" }}>VS</div>
            <div style={{ fontSize: "28px" }}>⚔️</div>
            <div style={{ width: "1px", height: "100px", background: "linear-gradient(180deg, #374151, transparent)" }} />
          </div>

          {/* 플레이어 2 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flex: 1, gap: "16px" }}>
            <div style={{ fontSize: "10px", fontWeight: "900", color: "#f43f5e", letterSpacing: "4px" }}>PLAYER 2</div>
            <div
              style={{
                fontSize: nick2.length > 14 ? "38px" : "50px",
                fontWeight: "900",
                color: "#ffe4e6",
                letterSpacing: "-2px",
                lineHeight: "1.05",
                textAlign: "right",
              }}
            >
              {nick2}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
              {["AI 전술 분석", "2D 리플레이", "티어 평가"].map((feat, i) => (
                <div key={feat} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "#f43f5e", fontWeight: "700", opacity: 1 - i * 0.2 }}>{feat}</span>
                  <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#f43f5e" }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 하단 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 48px 26px", gap: "10px" }}>
          <div
            style={{
              padding: "10px 28px",
              background: "#ffffff06",
              border: "1px solid #ffffff10",
              borderRadius: "30px",
              fontSize: "14px",
              fontWeight: "700",
              color: "#6b7280",
            }}
          >
            bgms.kr에서 전적 비교 결과 확인하기 →
          </div>
          <div style={{ fontSize: "10px", color: "#1f2937", fontWeight: "700", letterSpacing: "3px" }}>
            BGMS · BATTLEGROUNDS GAMING MAP SERVICE
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
