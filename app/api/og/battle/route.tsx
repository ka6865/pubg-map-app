// app/api/og/battle/route.tsx
// 전적비교배틀 OG 이미지 — 스코어 표시 포함 버전

import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const nick1 = searchParams.get("nick1") || "플레이어1";
  const nick2 = searchParams.get("nick2") || "플레이어2";
  const score1 = searchParams.get("score1");
  const score2 = searchParams.get("score2");
  const winner = searchParams.get("winner") || "";

  const hasScore = score1 !== null && score2 !== null;
  const s1 = Number(score1 ?? 0);
  const s2 = Number(score2 ?? 0);

  // 닉네임 길이에 따른 폰트 크기 동적 조정
  const maxLen = Math.max(nick1.length, nick2.length);
  const nickFontSize = maxLen > 14 ? "44px" : maxLen > 10 ? "56px" : "64px";

  // 승자 결정
  const nick1Wins = winner === nick1 || (!winner && s1 > s2);
  const nick2Wins = winner === nick2 || (!winner && s2 > s1);

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
        {/* 배경 그라디언트 */}
        <div style={{ position: "absolute", top: 0, left: 0, width: "500px", height: "630px", background: "linear-gradient(135deg, #4f46e530 0%, transparent 60%)" }} />
        <div style={{ position: "absolute", top: 0, right: 0, width: "500px", height: "630px", background: "linear-gradient(225deg, #f43f5e30 0%, transparent 60%)" }} />
        <div style={{ position: "absolute", top: 0, left: "380px", width: "440px", height: "630px", background: "linear-gradient(90deg, transparent, #080810 25%, #080810 75%, transparent)" }} />

        {/* 상단 브랜드 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "26px 48px 0", gap: "12px" }}>
          <div style={{ fontSize: "20px", fontWeight: "900", color: "#f59e0b" }}>🏆 BGMS</div>
          <div style={{ width: "1px", height: "16px", background: "#374151" }} />
          <div style={{ fontSize: "11px", color: "#6b7280", fontWeight: "800", letterSpacing: "2px" }}>전적 비교 배틀</div>
        </div>

        {/* 메인 영역 */}
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", padding: "0 56px" }}>

          {/* 플레이어 1 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", flex: 1, gap: "10px" }}>
            <div style={{ fontSize: "11px", fontWeight: "900", color: "#818cf8", letterSpacing: "4px" }}>PLAYER 1</div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {nick1Wins && hasScore && (
                <div style={{ fontSize: "28px" }}>👑</div>
              )}
              <div
                style={{
                  fontSize: nickFontSize,
                  fontWeight: "900",
                  color: nick1Wins ? "#c7d2fe" : "#ffffff",
                  letterSpacing: "-2px",
                  lineHeight: "1.05",
                  textShadow: nick1Wins ? "0 0 40px #6366f180" : "none",
                }}
              >
                {nick1}
              </div>
            </div>
            <div
              style={{
                background: "#6366f118",
                border: "1px solid #6366f140",
                borderRadius: "8px",
                padding: "5px 14px",
                fontSize: "12px",
                color: "#818cf8",
                fontWeight: "700",
              }}
            >
              AI 전적 분석 · 2D 리플레이
            </div>
          </div>

          {/* 중앙 스코어 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", minWidth: "160px" }}>
            {hasScore ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div
                    style={{
                      fontSize: "72px",
                      fontWeight: "900",
                      color: nick1Wins ? "#818cf8" : "#374151",
                      letterSpacing: "-4px",
                      lineHeight: "1",
                      textShadow: nick1Wins ? "0 0 30px #6366f160" : "none",
                    }}
                  >
                    {s1}
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: "900", color: "#1e293b" }}>:</div>
                  <div
                    style={{
                      fontSize: "72px",
                      fontWeight: "900",
                      color: nick2Wins ? "#f43f5e" : "#374151",
                      letterSpacing: "-4px",
                      lineHeight: "1",
                      textShadow: nick2Wins ? "0 0 30px #f43f5e60" : "none",
                    }}
                  >
                    {s2}
                  </div>
                </div>
                <div style={{ fontSize: "11px", color: "#374151", fontWeight: "800", letterSpacing: "2px" }}>
                  SCORE
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: "72px", fontWeight: "900", color: "#1e293b", letterSpacing: "-4px", lineHeight: "1" }}>VS</div>
                <div style={{ fontSize: "22px", marginTop: "-4px" }}>⚔️</div>
              </>
            )}
          </div>

          {/* 플레이어 2 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flex: 1, gap: "10px" }}>
            <div style={{ fontSize: "11px", fontWeight: "900", color: "#f43f5e", letterSpacing: "4px" }}>PLAYER 2</div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  fontSize: nickFontSize,
                  fontWeight: "900",
                  color: nick2Wins ? "#fecdd3" : "#ffffff",
                  letterSpacing: "-2px",
                  lineHeight: "1.05",
                  textAlign: "right",
                  textShadow: nick2Wins ? "0 0 40px #f43f5e80" : "none",
                }}
              >
                {nick2}
              </div>
              {nick2Wins && hasScore && (
                <div style={{ fontSize: "28px" }}>👑</div>
              )}
            </div>
            <div
              style={{
                background: "#f43f5e18",
                border: "1px solid #f43f5e40",
                borderRadius: "8px",
                padding: "5px 14px",
                fontSize: "12px",
                color: "#f43f5e",
                fontWeight: "700",
              }}
            >
              AI 전적 분석 · 2D 리플레이
            </div>
          </div>
        </div>

        {/* 하단 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0 48px 22px", gap: "16px" }}>
          <div style={{ flex: 1, height: "1px", background: "linear-gradient(90deg, transparent, #1f2937)" }} />
          <div style={{ fontSize: "12px", color: "#4b5563", fontWeight: "700", letterSpacing: "1px" }}>
            bgms.kr에서 전체 결과 확인하기 →
          </div>
          <div style={{ flex: 1, height: "1px", background: "linear-gradient(90deg, #1f2937, transparent)" }} />
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
