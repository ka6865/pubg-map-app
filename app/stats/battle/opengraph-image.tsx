// app/stats/battle/opengraph-image.tsx
// 전적비교배틀 페이지용 동적 OG 이미지 생성
// ?nick1=AAA&nick2=BBB URL 파라미터만 사용 (API 호출 없음 → 초고속)

import { ImageResponse } from "next/og";

export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

export default async function OgImage({
  searchParams,
}: {
  searchParams?: Promise<{ nick1?: string; nick2?: string }> | { nick1?: string; nick2?: string };
}) {
  const resolved = searchParams
    ? (searchParams instanceof Promise ? await searchParams : searchParams)
    : {};
  const nick1 = resolved?.nick1 ?? "플레이어1";
  const nick2 = resolved?.nick2 ?? "플레이어2";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "linear-gradient(135deg, #080810 0%, #0f0f1a 50%, #080810 100%)",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
          fontFamily: "sans-serif",
        }}
      >
        {/* 왼쪽 인디고 글로우 */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "500px",
            height: "630px",
            background: "linear-gradient(135deg, #6366f125 0%, transparent 60%)",
          }}
        />
        {/* 오른쪽 로즈 글로우 */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "500px",
            height: "630px",
            background: "linear-gradient(225deg, #f43f5e25 0%, transparent 60%)",
          }}
        />

        {/* 상단 BGMS 브랜드 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px 48px 0",
            gap: "14px",
          }}
        >
          <div style={{ fontSize: "24px", fontWeight: "900", color: "#f59e0b" }}>🏆 BGMS</div>
          <div
            style={{
              fontSize: "12px",
              color: "#4b5563",
              fontWeight: "800",
              letterSpacing: "2px",
              paddingLeft: "14px",
              borderLeft: "1px solid #374151",
            }}
          >
            전적 비교 배틀
          </div>
        </div>

        {/* 메인 VS 영역 */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 72px",
          }}
        >
          {/* 플레이어 1 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              flex: 1,
              gap: "14px",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: "900",
                color: "#818cf8",
                letterSpacing: "4px",
              }}
            >
              PLAYER 1
            </div>
            <div
              style={{
                fontSize: nick1.length > 14 ? "40px" : "52px",
                fontWeight: "900",
                color: "#e0e7ff",
                letterSpacing: "-2px",
                lineHeight: "1.1",
              }}
            >
              {nick1}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "#6366f115",
                border: "1px solid #6366f140",
                borderRadius: "10px",
                padding: "7px 16px",
              }}
            >
              <span style={{ fontSize: "13px", color: "#818cf8", fontWeight: "700" }}>AI 분석 대기중</span>
            </div>
          </div>

          {/* VS 중앙 구분선 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
              minWidth: "160px",
            }}
          >
            <div
              style={{
                width: "1px",
                height: "90px",
                background: "linear-gradient(180deg, transparent, #374151, transparent)",
              }}
            />
            <div
              style={{
                fontSize: "60px",
                fontWeight: "900",
                color: "#1f2937",
                letterSpacing: "-3px",
              }}
            >
              VS
            </div>
            <div style={{ fontSize: "20px" }}>⚔️</div>
            <div
              style={{
                width: "1px",
                height: "90px",
                background: "linear-gradient(180deg, transparent, #374151, transparent)",
              }}
            />
          </div>

          {/* 플레이어 2 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              flex: 1,
              gap: "14px",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: "900",
                color: "#f43f5e",
                letterSpacing: "4px",
              }}
            >
              PLAYER 2
            </div>
            <div
              style={{
                fontSize: nick2.length > 14 ? "40px" : "52px",
                fontWeight: "900",
                color: "#ffe4e6",
                letterSpacing: "-2px",
                lineHeight: "1.1",
                textAlign: "right",
              }}
            >
              {nick2}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "#f43f5e15",
                border: "1px solid #f43f5e40",
                borderRadius: "10px",
                padding: "7px 16px",
              }}
            >
              <span style={{ fontSize: "13px", color: "#f43f5e", fontWeight: "700" }}>AI 분석 대기중</span>
            </div>
          </div>
        </div>

        {/* 하단 CTA */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "0 48px 30px",
            gap: "10px",
          }}
        >
          <div
            style={{
              padding: "11px 30px",
              background: "#ffffff08",
              border: "1px solid #ffffff15",
              borderRadius: "30px",
              fontSize: "15px",
              fontWeight: "700",
              color: "#9ca3af",
            }}
          >
            bgms.kr에서 전적 비교 결과 확인하기 →
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "#374151",
              fontWeight: "700",
              letterSpacing: "2px",
            }}
          >
            BGMS · BATTLEGROUNDS GAMING MAP SERVICE
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
