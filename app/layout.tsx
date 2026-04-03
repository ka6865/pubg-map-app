import type { Metadata } from "next"; // Next.js 메타데이터 타입
import "./globals.css"; // 전역 스타일시트
import { AuthProvider } from "@/components/AuthProvider";
import { Toaster } from "sonner";
import BottomNav from "@/components/common/BottomNav";

// 브라우저 탭 제목, 설명, 파비콘 메타데이터 정의
export const metadata: Metadata = {
  metadataBase: new URL("https://bgmap.kr"), // BGMAP.kr 도메인 반영
  title: {
    default: "BGMAP.kr | 배틀그라운드 통합 지도 서비스 - 차량 및 전술 정보",
    template: "%s | BGMAP.kr"
  },
  description: "에란겔, 미라마, 태이고 등 배틀그라운드 모든 맵의 차량/보트 위치와 실시간 전적, 아이템 무게 계산기를 제공하는 전문 전술 플랫폼 BGMAP.kr입니다.",
  keywords: ["배틀그라운드", "배그 지도", "BGMAP", "배그 전적", "에란겔 지도", "미라마 지도", "태이고 지도", "차스폰 위치", "PUBG Map", "배그 차량 위치"],
  authors: [{ name: "BGMAP Team" }],
  openGraph: {
    title: "BGMAP.kr - 배틀그라운드 모든 맵 차량 위치 및 전술 정보",
    description: "에란겔부터 태이고까지, 배틀그라운드 전장의 모든 차량 스폰 위치를 한눈에 확인하세요.",
    url: "https://bgmap.kr",
    siteName: "BGMAP.kr",
    images: [
      {
        url: "/Erangel.jpg", // 대표 이미지
        width: 1200,
        height: 630,
        alt: "배틀그라운드 통합 지도 BGMAP.kr 미리보기",
      },
    ],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BGMAP.kr - 배틀그라운드 전술 지도 및 전적 서비스",
    description: "에란겔, 미라마, 태이고 등 배틀그라운드 정보를 한눈에!",
    images: ["/Erangel.jpg"],
  },
};

// 최상위 HTML 뼈대 렌더링 컴포넌트
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <AuthProvider>
          <div className="flex flex-col min-h-screen">
            <main className="flex-grow pb-14 md:pb-0">
              {children}
            </main>
            <BottomNav />
          </div>
          <Toaster theme="dark" position="top-center" richColors />
        </AuthProvider>
      </body>
    </html>
  );
}