// app/api/og/battle/route.tsx
// 전적비교배틀 OG 이미지 — 썸네일에서도 선명하게 읽히도록 최적화된 버전

import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const nick1 = searchParams.get("nick1") || "플레이어1";
  const nick2 = searchParams.get("nick2") || "플레이어2";

  // 닉네임 길이에 따른 폰트 크기 동적 조정
  const maxLen = Math.max(nick1.length, nick2.length);
  const nickFontSize = maxLen > 14 ? "52px" : maxLen > 10 ? "62px" : "72px";

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
        <div style={{ position: "absolute", top: 0, left: 0, width: "480px", height: "630px", background: "linear-gradient(135deg, #4f46e535 0%, transparent 65%)" }} />
        {/* 오른쪽 로즈 그라디언트 */}
        <div style={{ position: "absolute", top: 0, right: 0, width: "480px", height: "630px", background: "linear-gradient(225deg, #f43f5e35 0%, transparent 65%)" }} />
        {/* 가운데 어두운 띠 */}
        <div style={{ position: "absolute", top: 0, left: "380px", width: "440px", height: "630px", background: "linear-gradient(90deg, transparent, #080810 25%, #080810 75%, transparent)" }} />

        {/* 상단 BGMS 브랜드 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 48px 0", gap: "12px" }}>
          <div style={{ fontSize: "20px", fontWeight: "900", color: "#f59e0b" }}>🏆 BGMS</div>
          <div style={{ width: "1px", height: "16px", background: "#374151" }} />
          <div style={{ fontSize: "11px", color: "#6b7280", fontWeight: "800", letterSpacing: "2px" }}>전적 비교 배틀</div>
        </div>

        {/* 메인 VS 영역 */}
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", padding: "0 60px" }}>

          {/* 플레이어 1 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", flex: 1, gap: "12px" }}>
            <div style={{ fontSize: "12px", fontWeight: "900", color: "#818cf8", letterSpacing: "4px" }}>PLAYER 1</div>
            <div
              style={{
                fontSize: nickFontSize,
                fontWeight: "900",
                color: "#ffffff",
                letterSpacing: "-2px",
                lineHeight: "1.05",
                textShadow: "0 0 40px #6366f160",
              }}
            >
              {nick1}
            </div>
            <div
              style={{
                background: "#6366f120",
                border: "1px solid #6366f150",
                borderRadius: "8px",
                padding: "6px 14px",
                fontSize: "13px",
                color: "#818cf8",
                fontWeight: "700",
              }}
            >
              AI 전적 분석 · 2D 리플레이
            </div>
          </div>

          {/* VS 중앙 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0px", minWidth: "140px" }}>
            <div style={{ fontSize: "80px", fontWeight: "900", color: "#1e293b", letterSpacing: "-4px", lineHeight: "1" }}>VS</div>
            <div style={{ fontSize: "24px", marginTop: "-4px" }}>⚔️</div>
          </div>

          {/* 플레이어 2 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flex: 1, gap: "12px" }}>
            <div style={{ fontSize: "12px", fontWeight: "900", color: "#f43f5e", letterSpacing: "4px" }}>PLAYER 2</div>
            <div
              style={{
                fontSize: nickFontSize,
                fontWeight: "900",
                color: "#ffffff",
                letterSpacing: "-2px",
                lineHeight: "1.05",
                textAlign: "right",
                textShadow: "0 0 40px #f43f5e60",
              }}
            >
              {nick2}
            </div>
            <div
              style={{
                background: "#f43f5e20",
                border: "1px solid #f43f5e50",
                borderRadius: "8px",
                padding: "6px 14px",
                fontSize: "13px",
                color: "#f43f5e",
                fontWeight: "700",
              }}
            >
              AI 전적 분석 · 2D 리플레이
            </div>
          </div>
        </div>

        {/* 하단 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0 48px 24px", gap: "16px" }}>
          <div style={{ flex: 1, height: "1px", background: "linear-gradient(90deg, transparent, #1f2937)" }} />
          <div style={{ fontSize: "13px", color: "#4b5563", fontWeight: "700", letterSpacing: "1px" }}>
            bgms.kr에서 결과 확인하기 →
          </div>
          <div style={{ flex: 1, height: "1px", background: "linear-gradient(90deg, #1f2937, transparent)" }} />
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
