import { Metadata } from 'next';

export const metadata: Metadata = {
  title: "배그 전술 무기고 - 모든 총기 스탯 및 패치노트",
  description: "배틀그라운드 에란겔부터 태이고까지, 모든 총기의 데미지, 탄속, 탄약 정보를 상세히 비교해보세요. 실시간 업데이트되는 배그 무기 도감 BGMS입니다.",
  alternates: {
    canonical: "/weapons",
  },
  openGraph: {
    title: "배그 전술 무기고 | BGMS",
    description: "최신 패치 정보가 반영된 배그 무기 스탯 데이터베이스입니다.",
    url: "/weapons",
    type: "website",
  }
};

export default function WeaponsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
