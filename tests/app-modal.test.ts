// @vitest-environment jsdom

import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppModal } from '@/components/common/AppModal';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  window.scrollTo = vi.fn();
});

describe('AppModal', () => {
  it('footer보다 높은 공통 레이어에서 대화상자를 렌더링한다', () => {
    render(createElement(AppModal, {
      isOpen: true,
      title: '확률표',
      onClose: vi.fn(),
    }, createElement('p', null, '내용')));

    const dialog = screen.getByRole('dialog', { name: '확률표' });
    expect(dialog.parentElement?.classList.contains('z-[10000]')).toBe(true);
    expect(screen.getByText('내용')).not.toBeNull();
  });

  it('ESC를 누르면 닫기 동작을 호출한다', () => {
    const onClose = vi.fn();
    render(createElement(AppModal, {
      isOpen: true,
      title: '확률표',
      onClose,
    }, createElement('p', null, '내용')));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
