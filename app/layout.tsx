import type { Metadata } from "next"; // Next.js 메타데이터 타입
import { Outfit } from "next/font/google"; // DESIGN.md 지정 폰트
import "./globals.css"; // 전역 스타일시트
import { AuthProvider } from "@/components/AuthProvider";
import { Toaster } from "sonner";
import GlobalHeader from "@/components/common/GlobalHeader";
import BottomNav from "@/components/common/BottomNav";
import Footer from "@/components/common/Footer";
import { Suspense } from "react";
import JsonLd from "@/components/seo/JsonLd";
import { GoogleAnalytics } from '@next/third-parties/google';


// Outfit 폰트 — 기하학적이고 현대적인 게이밍 타이포그래피
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-outfit",
});


// 브라우저 탭 제목, 설명, 파비콘 메타데이터 정의
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://bgms.kr";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl), // 도메인 유연성 확보
  title: {
    default: "BGMS | 배그 고젠 및 고정 차량 위치 - 배틀그라운드 통합 지도",
    template: "%s | BGMS 배그 고젠"
  },
  description: "에란겔(Erangel), 테이고(Taego), 론도(Rondo) 등 배틀그라운드 모든 맵의 고정 젠(고젠) 차량 위치와 비밀의 열쇠 소지품, 실시간 전적, 아이템 무게 계산기를 제공하는 전문 전술 플랫폼 BGMS입니다.",
  keywords: ["배틀그라운드", "배그 지도", "BGMS", "배그 전적", "배그 고젠", "배그 고정 젠", "에란겔 고젠", "미라마 고젠", "태이고 고젠", "테이고 고젠", "론도 고젠", "차스폰 위치", "PUBG Map", "배그 차량 위치", "비밀의 열쇠", "에란겔 비밀의 열쇠", "테이고 비밀의 열쇠", "론도 비밀의 열쇠", "배그 비밀방 위치"],
  authors: [{ name: "BGMS Team" }],
  alternates: {
    languages: {
      "ko-KR": "/",
    },
  },
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    title: "BGMS - 배틀그라운드 모든 맵 차량 위치 및 전술 정보",
    description: "에란겔부터 테이고, 론도까지! 배틀그라운드 전장의 모든 차량 스폰 위치와 비밀의 열쇠 위치를 한눈에 확인하세요.",
    url: "/",
    siteName: "BGMS",
    images: [
      {
        url: "/logo.png", // 새로 생성한 미니멀 로고 적용
        width: 1200,
        height: 630,
        alt: "BGMS 로고",
      },
    ],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BGMS - 배틀그라운드 전술 지도 및 전적 서비스",
    description: "에란겔, 테이고, 론도 등 배틀그라운드 비밀의 열쇠 및 차량 위치 정보를 한눈에!",
    images: ["/logo.png"],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#121212",
  appleMobileWebAppCapable: "yes",
  appleMobileWebAppStatusBarStyle: "black-translucent",
};

// 🌟 사이트 전체 구조화 데이터 (브랜드 및 검색창 지원)
const siteJsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "BGMS",
    "url": baseUrl,
    "logo": `${baseUrl}/logo.png`,
    "sameAs": [
      "https://github.com/ka6865/pubg-map-app"
    ]
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "url": baseUrl,
    "potentialAction": {
      "@type": "SearchAction",
      "target": `${baseUrl}/board?search={search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  }
];

// 최상위 HTML 뼈대 렌더링 컴포넌트
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={outfit.variable}>
      <head>
        <JsonLd data={siteJsonLd as any} />
      </head>
      <body className="antialiased bg-[#0d0d0d] text-white" style={{ fontFamily: 'var(--font-outfit), Pretendard, sans-serif' }}>
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID!} />
        <AuthProvider>

          <div className="flex flex-col min-h-dvh">
            <GlobalHeader />
            <main className="flex-grow pb-safe-nav md:pb-0 relative overflow-hidden flex flex-col">
              {children}
            </main>
            <Footer />
            <Suspense fallback={<div className="h-14 bg-[#121212]"></div>}>
              <BottomNav />
            </Suspense>
          </div>
          <Toaster theme="dark" position="top-center" richColors />
        </AuthProvider>
      </body>
    </html>
  );
}
