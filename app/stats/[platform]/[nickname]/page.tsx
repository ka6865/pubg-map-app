import { Metadata } from 'next';
import { getTabSeo } from '@/lib/seo-config';
import StatSearch from '@/components/StatSearch';

interface Props {
  params: Promise<{
    platform: string;
    nickname: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { nickname } = await params;
  const decodedNickname = decodeURIComponent(nickname);
  const seo = await getTabSeo("Stats");
  return {
    ...seo,
    title: `${decodedNickname} 전적 분석 | BGMS`,
    description: `${decodedNickname}님의 PUBG AI 정밀 전술 분석 리포트를 확인하세요.`,
  };
}

export default async function PlayerStatsPage({ params }: Props) {
  const { platform, nickname } = await params;
  const decodedNickname = decodeURIComponent(nickname);

  return (
    <div className="w-full h-full overflow-y-auto bg-[#0d0d0d] flex justify-center">
      <div className="w-full max-w-[1200px]">
        <StatSearch initialPlatform={platform} initialNickname={decodedNickname} />
      </div>
    </div>
  );
}
