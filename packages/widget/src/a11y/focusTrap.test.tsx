import { cleanup, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useFocusTrap } from './focusTrap.js';

function Trap() {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  return (
    <div ref={ref}>
      <button data-testid="a">a</button>
      <button data-testid="b">b</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  afterEach(cleanup);

  it('wraps focus from last → first on Tab', () => {
    const { getByTestId } = render(<Trap />);
    (getByTestId('b') as HTMLElement).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(getByTestId('a'));
  });
  it('wraps focus from first → last on Shift+Tab', () => {
    const { getByTestId } = render(<Trap />);
    (getByTestId('a') as HTMLElement).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(getByTestId('b'));
  });
});
