/**
 * @jest-environment jsdom
 */
import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react';
import { createElement } from 'react';

import type { Dispatch } from '../../editor-actions/actionRegistry';
import { EditorHotkeys } from '../EditorHotkeys';

const NONE = 0;

/**
 * jsdom's userAgent is not Apple, so react-hotkeys-hook maps `mod` to ctrl.
 * Firing both a meta-only and a ctrl-only variant means exactly one matches the
 * platform-resolved `mod+z` combo regardless of detection, so an active binding
 * dispatches exactly once and an inert one never fires. react-hotkeys-hook keys
 * off `event.code`, so `KeyZ` is required alongside `key`.
 */
function pressUndo(target: EventTarget = document.body): void {
  const variants: ReadonlyArray<{ metaKey?: boolean; ctrlKey?: boolean }> = [
    { metaKey: true },
    { ctrlKey: true },
  ];
  for (const modifiers of variants) {
    const event = new KeyboardEvent('keydown', {
      key: 'z',
      code: 'KeyZ',
      bubbles: true,
      cancelable: true,
      ...modifiers,
    });
    target.dispatchEvent(event);
  }
}

function pressEscape(target: EventTarget = document.body): void {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
}

function makeDispatch(): { dispatch: Dispatch; calls: string[] } {
  const calls: string[] = [];
  const dispatch: Dispatch = (id: string) => {
    calls.push(id);
  };
  return { dispatch, calls };
}

describe('EditorHotkeys: active gating', () => {
  it('dispatches history.undo on mod+z when active', () => {
    const { dispatch, calls } = makeDispatch();
    render(createElement(EditorHotkeys, { dispatch, active: true, ctx: { searchOpen: false } }));
    pressUndo();
    expect(calls).toContain('history.undo');
  });

  it('does nothing when inactive (hidden cached editor / readOnly / agent mode)', () => {
    const { dispatch, calls } = makeDispatch();
    render(createElement(EditorHotkeys, { dispatch, active: false, ctx: { searchOpen: false } }));
    pressUndo();
    expect(calls).toHaveLength(NONE);
  });
});

describe('EditorHotkeys: form-field and ctx gating', () => {
  it('is inert while typing in an input (native text undo preserved)', () => {
    const { dispatch, calls } = makeDispatch();
    render(
      createElement(
        'div',
        null,
        createElement(EditorHotkeys, { dispatch, active: true, ctx: { searchOpen: false } }),
        createElement('input', { 'data-testid': 'field' })
      )
    );
    const input = document.querySelector('input');
    input?.focus();
    if (input !== null) pressUndo(input);
    expect(calls).toHaveLength(NONE);
  });

  it('is inert in contentEditable elements', () => {
    const { dispatch, calls } = makeDispatch();
    render(createElement(EditorHotkeys, { dispatch, active: true, ctx: { searchOpen: false } }));
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    // jsdom leaves `isContentEditable` undefined; real browsers report true for a
    // contenteditable element, which is what react-hotkeys-hook's guard reads.
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    document.body.appendChild(editable);
    pressUndo(editable);
    expect(calls).toHaveLength(NONE);
  });

  it('does not dispatch search.close on Escape when searchOpen is false', () => {
    const { dispatch, calls } = makeDispatch();
    render(createElement(EditorHotkeys, { dispatch, active: true, ctx: { searchOpen: false } }));
    pressEscape();
    expect(calls).not.toContain('search.close'); // searchOpen: false → enabled(ctx) disabled
  });

  it('dispatches search.close on Escape when searchOpen is true', () => {
    const { dispatch, calls } = makeDispatch();
    render(createElement(EditorHotkeys, { dispatch, active: true, ctx: { searchOpen: true } }));
    pressEscape();
    expect(calls).toContain('search.close');
  });
});
