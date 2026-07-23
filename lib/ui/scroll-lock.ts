export interface BodyScrollLockStyles {
  position: 'fixed';
  top: string;
  width: '100%';
  overflow: 'hidden';
  paddingRight: string;
}

export function getBodyScrollLockStyles(scrollY: number, scrollbarWidth: number): BodyScrollLockStyles {
  return {
    position: 'fixed',
    top: scrollY === 0 ? '0px' : `-${scrollY}px`,
    width: '100%',
    overflow: 'hidden',
    paddingRight: scrollbarWidth > 0 ? `${scrollbarWidth}px` : '',
  };
}
