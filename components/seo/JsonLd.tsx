// components/seo/JsonLd.tsx
import { JsonLdProps } from '@/types/seo';

interface JsonLdComponentProps {
  data: JsonLdProps | JsonLdProps[];
}

/**
 * 구조화된 데이터(JSON-LD)를 렌더링하는 컴포넌트입니다.
 * 단일 객체 또는 객체 배열을 처리할 수 있습니다.
 */
export default function JsonLd({ data }: JsonLdComponentProps) {
  const jsonData = Array.isArray(data) ? data : [data];

  return (
    <>
      {jsonData.map((item, index) => (
        <script
          key={`json-ld-${item["@type"]}-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </>
  );
}
