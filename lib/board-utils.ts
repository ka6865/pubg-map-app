// 게시글 작성 시 이미지 미포함 및 텍스트 없는 공백/태그 상태 빈 게시물 판별 로직
export function isContentEmpty(content: string): boolean {
  return (
    content
      .replace(/<[^>]*>?/gm, "")
      .replace(/&nbsp;/g, "")
      .trim().length === 0 && !content.includes("<img")
  );
}

// 제목 길이 한도 검사, 데이터 누락 여부 확인 및 Base64 비정상 이미지 클립보드 삽입 차단
export function validatePost(
  title: string,
  content: string,
  currentUser: unknown
): string | null {
  if (!currentUser) {
    return "로그인이 필요한 기능입니다.";
  }

  const trimmedTitle = title.trim();

  if (!trimmedTitle || isContentEmpty(content)) {
    return "제목과 내용을 모두 입력해주세요.";
  }

  if (trimmedTitle.length > 50) {
    return "제목은 50자 이내로 입력해주세요.";
  }

  // 🌟 [보안/성능] Base64 이미지(직접 붙여넣기) 감지 정규식 (싱글/더블 쿼터 및 대소문자 대응)
  const base64Regex = /src\s*=\s*["']?\s*data:image\/[^;]+;base64[^"'>\s]*["']?/gi;
  if (base64Regex.test(content)) {
    return "이미지 직접 붙여넣기는 허용되지 않습니다.\n에디터 상단의 '이미지 전용 업로드' 버튼을 이용해 주세요.";
  }

  // 🌟 [안정성] 본문 데이터 전송 크기 제한 (약 50만 자, 한글 기준 약 1MB 수준)
  if (content.length > 500000) {
    return "게시글 내용이 너무 큽니다. 불필요한 이미지 데이터를 제거해 주세요.";
  }

  return null;
}

// 본문 HTML 구문 내 첫 번째 <img> 태그 주소 추출을 통한 게시판 목록 썸네일 아이콘 표시 여부 판별
export function extractImageUrl(content: string): string {
  if (!content.includes("<img")) return "";

  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && imgMatch[1]) {
    return imgMatch[1];
  }
  return "has_image";
}

// 게시판 제목 문자열 양끝 불필요 공백 제거
export function sanitizeTitle(title: string): string {
  return title.trim();
}
