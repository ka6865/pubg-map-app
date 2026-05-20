// app/stats/battle/layout.tsx
// 배틀 페이지 Server Component 래퍼 - OG 이미지 메타 태그를 동적으로 주입합니다.
// page.tsx가 "use client"라 generateMetadata를 직접 사용할 수 없으므로 layout에서 처리합니다.

import { Metadata } from "next";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://bgms.kr";

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<{ nick1?: string; nick2?: string }>;
}): Promise<Metadata> {
  const params = searchParams ? await searchParams : {};
  const nick1 = params?.nick1 || "";
  const nick2 = params?.nick2 || "";

  const hasPlayers = nick1 && nick2;
  const title = hasPlayers
    ? `${nick1} vs ${nick2} 전적 비교 | BGMS`
    : "전적 비교 배틀 | BGMS";
  const description = hasPlayers
    ? `${nick1}과 ${nick2}의 PUBG 전적을 AI로 항목별 비교합니다. KDA, 딜량, 생존 시간 등을 BGMS에서 확인하세요.`
    : "두 플레이어의 PUBG 전적을 AI로 항목별 비교 대결합니다.";

  // API Route를 OG 이미지로 연결
  const ogImageUrl = hasPlayers
    ? `${baseUrl}/api/og/battle?nick1=${encodeURIComponent(nick1)}&nick2=${encodeURIComponent(nick2)}`
    : `${baseUrl}/api/og/battle`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${baseUrl}/stats/battle`,
      siteName: "BGMS",
      locale: "ko_KR",
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: hasPlayers ? `${nick1} vs ${nick2} 전적 비교` : "BGMS 전적 비교 배틀",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default function BattleLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
