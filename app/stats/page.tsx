import { Metadata } from 'next';
import { getTabSeo } from '@/lib/seo-config';
import StatSearch from '@/components/StatSearch';

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getTabSeo("Stats");
  return {
    ...seo,
    title: "전적 검색 | BGMS",
  };
}

export default function StatsPage() {
  return (
    <div className="w-full h-full overflow-y-auto bg-[#0d0d0d] flex justify-center">
      <div className="w-full max-w-[1200px]">
        <StatSearch />
      </div>
    </div>
  );
}
