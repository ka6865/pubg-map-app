import { Metadata } from 'next';

export const metadata: Metadata = {
  title: "배그 인벤토리 시뮬레이터 - 아이템 무게 및 가방 계산기",
  description: "배틀그라운드 가방과 차량 트렁크에 아이템을 얼마나 담을 수 있을까요? 실시간 무게 계산기로 완벽한 파밍 전략을 세워보세요.",
  alternates: {
    canonical: "/backpack",
  },
  openGraph: {
    title: "배그 인벤토리 시뮬레이터 | BGMS",
    description: "아이템 무게와 가방/트렁크 용량을 실시간으로 시뮬레이션해보세요.",
    url: "/backpack",
    type: "website",
  }
};

export default function BackpackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
