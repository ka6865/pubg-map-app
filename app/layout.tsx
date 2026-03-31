import type { Metadata } from "next"; // Next.js 메타데이터 타입
import { Geist, Geist_Mono } from "next/font/google"; // 구글 폰트 로드 모듈
import "./globals.css"; // 전역 스타일시트
import { AuthProvider } from "@/components/AuthProvider";
import { Toaster } from "sonner";

// 앱 전체 적용 폰트 설정
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 브라우저 탭 제목, 설명, 파비콘 메타데이터 정의
export const metadata: Metadata = {
  metadataBase: new URL("https://pubg-map.app"), // 실제 도메인이 있다면 수정 필요
  title: {
    default: "배틀그라운드 지도 - 에란겔, 미라마, 태이고 차량 스폰 위치",
    template: "%s | 배틀그라운드 지도"
  },
  description: "에란겔, 미라마, 태이고 등 배틀그라운드 모든 맵의 차량과 보트 위치를 확인하고 공유하세요. 파쿠르 위치와 전략적 포인트도 함께 제공합니다.",
  keywords: ["배틀그라운드", "배그 지도", "에란겔 지도", "미라마 지도", "태이고 지도", "차스폰 위치", "PUBG Map", "배그 차량 위치"],
  authors: [{ name: "PUBG Map App Team" }],
  icons: {
    icon: "/car.png"
  },
  openGraph: {
    title: "배틀그라운드 통합 지도 서비스",
    description: "에란겔부터 태이고까지, 배틀그라운드 모든 전장의 차량 스폰 위치를 한눈에 확인하세요.",
    url: "https://pubg-map.app", // 실제 도메인이 있다면 수정 필요
    siteName: "배틀그라운드 지도",
    images: [
      {
        url: "/Erangel.jpg", // 대표 이미지
        width: 1200,
        height: 630,
        alt: "배틀그라운드 에란겔 지도 미리보기",
      },
    ],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "배틀그라운드 모든 맵의 차량 위치 정보",
    description: "에란겔, 미라마, 태이고 등 배틀그라운드 맵 정보를 실시간으로 확인하세요.",
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          {children}
          <Toaster theme="dark" position="top-center" richColors />
        </AuthProvider>
      </body>
    </html>
  );
}