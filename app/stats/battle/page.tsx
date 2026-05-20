// app/stats/battle/page.tsx
// Server Component — searchParams로 OG 메타데이터를 생성하고 BattleClient를 렌더링합니다.

import { Metadata } from "next";
import BattleClient from "./BattleClient";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://bgms.kr";

interface Props {
  searchParams: Promise<{ nick1?: string; nick2?: string; matchType?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const nick1 = params?.nick1 || "";
  const nick2 = params?.nick2 || "";

  const hasPlayers = nick1 && nick2;
  const title = hasPlayers
    ? `${nick1} vs ${nick2} 전적 비교 | BGMS`
    : "전적 비교 배틀 | BGMS";
  const description = hasPlayers
    ? `${nick1}과 ${nick2}의 PUBG 전적을 AI로 항목별 비교합니다. KDA, 딜량, 생존 시간 등을 BGMS에서 확인하세요.`
    : "두 플레이어의 PUBG 전적을 AI로 항목별 비교 대결합니다.";

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
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default function BattlePage() {
  return <BattleClient />;
}
