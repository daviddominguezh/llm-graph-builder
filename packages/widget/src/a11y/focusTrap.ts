import { type RefObject, useEffect } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function wrapFocus(e: KeyboardEvent, first: HTMLElement, last: HTMLElement): void {
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

const EMPTY = 0;
const LAST_INDEX_OFFSET = -1;

function buildKeyHandler(container: HTMLElement) {
  return function onKey(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;
    const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length === EMPTY) return;
    const [first] = focusables;
    const last = focusables.at(LAST_INDEX_OFFSET);
    if (first === undefined || last === undefined) return;
    wrapFocus(e, first, last);
  };
}

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    const { current: container } = ref;
    if (container === null) return undefined;
    const onKey = buildKeyHandler(container);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, active]);
}
