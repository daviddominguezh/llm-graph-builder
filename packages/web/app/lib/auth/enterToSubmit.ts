import type { KeyboardEvent } from 'react';

export function enterToSubmit(e: KeyboardEvent<HTMLFormElement>): void {
  if (e.key !== 'Enter' || e.shiftKey || e.defaultPrevented) return;
  if (e.nativeEvent.isComposing) return;
  if (!(e.target instanceof HTMLInputElement)) return;
  const submitBtn = e.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]:not([disabled])');
  if (submitBtn === null) return;
  e.preventDefault();
  e.currentTarget.requestSubmit(submitBtn);
}
