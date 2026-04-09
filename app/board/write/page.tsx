import HomeClient from '../../HomeClient';
import { Metadata } from 'next';
import { getTabSeo } from '@/lib/seo-config';

export async function generateMetadata(): Promise<Metadata> {
  const baseMeta = getTabSeo("Board");
  return {
    ...baseMeta,
    title: `글쓰기 | ${baseMeta.title}`,
    robots: { index: false } // 글쓰기 페이지는 색인 제외
  };
}

export default async function BoardWritePage() {
  return <HomeClient jsonLd={[]} initialMapId="Board" initialIsWriting={true} />;
}
