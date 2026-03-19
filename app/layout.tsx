import type { Metadata } from "next"; // Next.js 메타데이터 타입
import { Geist, Geist_Mono } from "next/font/google"; // 구글 폰트 로드 모듈
import "./globals.css"; // 전역 스타일시트

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
  title: "배틀그라운드 에란겔 차량 지도",
  description: "에란겔의 차량과 보트 위치를 기록하고 공유하세요.",
  icons:{
    icon: "/car.png"
  }
};

// 최상위 HTML 뼈대 렌더링 컴포넌트
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}