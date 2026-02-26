/** 본문 내용이 완전히 비어있는지(이미지 포함 여부 고려) 확인. */
export function isContentEmpty(content: string): boolean {
  return content.replace(/<[^>]*>?/gm, '').trim().length === 0 && !content.includes('<img');
}

/** 글 저장 전 필수 입력값, 제목 길이(50자 제한), 잘못된 이미지 첨부 방식을 최종 검사. */
export function validatePost(
  title: string,
  content: string,
  currentUser: unknown,
): string | null {
  const trimmedTitle = title.trim();

  if (!trimmedTitle || isContentEmpty(content) || !currentUser) {
    return '제목과 내용을 모두 입력해주세요.';
  }

  if (trimmedTitle.length > 50) {
    return '제목은 50자 이내로 입력해주세요.';
  }

  if (content.includes('src="data:image')) {
    return '이미지 붙여넣기 및 드래그 앤 드롭은 허용되지 않습니다.\n에디터 상단의 📷 이미지 버튼을 눌러 업로드해주세요.';
  }

  return null;
}

/** 게시글 목록에 띄울 썸네일용 첫 번째 이미지 주소를 추출. */
export function extractImageUrl(content: string): string {
  if (!content.includes('<img')) return '';

  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && imgMatch[1]) {
    return imgMatch[1];
  }
  return 'has_image';
}

/** 제목 양끝의 불필요한 공백(스페이스바, 엔터 등)을 깔끔하게 제거. */
export function sanitizeTitle(title: string): string {
  return title.trim();
}