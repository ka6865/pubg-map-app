import { validatePost, extractImageUrl, sanitizeTitle, isContentEmpty } from '../lib/board-utils';

const fakeUser = { id: 'user-1', email: 'test@test.com' };

describe('validatePost', () => {
  // Case 1: rejects titles longer than 50 characters
  describe('title length validation', () => {
    it('rejects a title with exactly 51 characters', () => {
      const longTitle = 'a'.repeat(51);
      const result = validatePost(longTitle, '<p>content</p>', fakeUser);
      expect(result).toBe('제목은 50자 이내로 입력해주세요.');
    });

    it('rejects a title much longer than 50 characters', () => {
      const longTitle = 'x'.repeat(200);
      const result = validatePost(longTitle, '<p>content</p>', fakeUser);
      expect(result).toBe('제목은 50자 이내로 입력해주세요.');
    });

    it('accepts a title with exactly 50 characters', () => {
      const title = 'a'.repeat(50);
      const result = validatePost(title, '<p>content</p>', fakeUser);
      expect(result).toBeNull();
    });

    it('rejects a padded title that exceeds 50 chars after trimming', () => {
      // 52 visible chars surrounded by spaces — trimmed length is 52
      const paddedTitle = '   ' + 'a'.repeat(52) + '   ';
      const result = validatePost(paddedTitle, '<p>content</p>', fakeUser);
      expect(result).toBe('제목은 50자 이내로 입력해주세요.');
    });
  });

  // Case 2: rejects empty title or content
  describe('empty title / content validation', () => {
    it('rejects an empty title', () => {
      const result = validatePost('', '<p>some content</p>', fakeUser);
      expect(result).toBe('제목과 내용을 모두 입력해주세요.');
    });

    it('rejects a whitespace-only title', () => {
      const result = validatePost('   ', '<p>some content</p>', fakeUser);
      expect(result).toBe('제목과 내용을 모두 입력해주세요.');
    });

    it('rejects empty content (empty paragraph tags)', () => {
      const result = validatePost('Valid Title', '<p><br></p>', fakeUser);
      expect(result).toBe('제목과 내용을 모두 입력해주세요.');
    });

    it('rejects content that is only whitespace inside tags', () => {
      const result = validatePost('Valid Title', '<p>   </p>', fakeUser);
      expect(result).toBe('제목과 내용을 모두 입력해주세요.');
    });

    it('rejects when no user is provided', () => {
      const result = validatePost('Title', '<p>content</p>', null);
      expect(result).toBe('제목과 내용을 모두 입력해주세요.');
    });

    it('accepts content that contains only an image', () => {
      const result = validatePost('Title', '<p><img src="https://example.com/img.png"></p>', fakeUser);
      expect(result).toBeNull();
    });
  });

  // Case 3: sanitizes and trims title before saving
  describe('title sanitisation', () => {
    it('returns null (valid) for a title with leading/trailing spaces within 50 chars', () => {
      const result = validatePost('  Hello World  ', '<p>content</p>', fakeUser);
      expect(result).toBeNull();
    });
  });
});

describe('sanitizeTitle', () => {
  it('trims leading and trailing whitespace', () => {
    expect(sanitizeTitle('  Hello World  ')).toBe('Hello World');
  });

  it('trims tabs and newlines', () => {
    expect(sanitizeTitle('\t\nHello\n\t')).toBe('Hello');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(sanitizeTitle('   ')).toBe('');
  });

  it('leaves a clean title unchanged', () => {
    expect(sanitizeTitle('Clean Title')).toBe('Clean Title');
  });
});

// Case 4: correctly extracts image URL from content
describe('extractImageUrl', () => {
  it('returns empty string when content has no images', () => {
    expect(extractImageUrl('<p>Hello world</p>')).toBe('');
  });

  it('extracts URL from a standard img tag with double quotes', () => {
    const content = '<p>text</p><img src="https://example.com/photo.jpg" alt="photo">';
    expect(extractImageUrl(content)).toBe('https://example.com/photo.jpg');
  });

  it("extracts URL from an img tag with single quotes", () => {
    const content = "<img src='https://cdn.example.com/image.png'>";
    expect(extractImageUrl(content)).toBe('https://cdn.example.com/image.png');
  });

  it('extracts the first image URL when multiple images exist', () => {
    const content =
      '<img src="https://first.com/a.jpg"><p>text</p><img src="https://second.com/b.jpg">';
    expect(extractImageUrl(content)).toBe('https://first.com/a.jpg');
  });

  it('returns "has_image" when img tag exists but src cannot be matched', () => {
    const content = '<img class="broken">';
    expect(extractImageUrl(content)).toBe('has_image');
  });
});

describe('isContentEmpty', () => {
  it('returns true for empty string', () => {
    expect(isContentEmpty('')).toBe(true);
  });

  it('returns true for tags with only whitespace', () => {
    expect(isContentEmpty('<p>  </p>')).toBe(true);
  });

  it('returns false for content with text', () => {
    expect(isContentEmpty('<p>Hello</p>')).toBe(false);
  });

  it('returns false for content with an image and no text', () => {
    expect(isContentEmpty('<p><img src="https://example.com/img.png"></p>')).toBe(false);
  });
});
