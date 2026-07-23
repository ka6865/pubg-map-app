import { describe, expect, it } from 'vitest';
import { getBodyScrollLockStyles } from '@/lib/ui/scroll-lock';

describe('getBodyScrollLockStyles', () => {
  it('현재 페이지 위치와 스크롤바 너비를 보존하는 잠금 스타일을 만든다', () => {
    expect(getBodyScrollLockStyles(428, 15)).toEqual({
      position: 'fixed',
      top: '-428px',
      width: '100%',
      overflow: 'hidden',
      paddingRight: '15px',
    });
  });

  it('스크롤바 너비가 없으면 불필요한 여백을 만들지 않는다', () => {
    expect(getBodyScrollLockStyles(0, 0)).toEqual({
      position: 'fixed',
      top: '0px',
      width: '100%',
      overflow: 'hidden',
      paddingRight: '',
    });
  });
});
