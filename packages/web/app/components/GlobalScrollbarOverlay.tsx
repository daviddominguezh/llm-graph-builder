'use client';

import { OverlayScrollbars, ScrollbarsHidingPlugin } from 'overlayscrollbars';
import { useEffect } from 'react';

OverlayScrollbars.plugin(ScrollbarsHidingPlugin);

const OVERFLOW_SELECTOR =
  '.overflow-auto, .overflow-y-auto, .overflow-x-auto, .overflow-scroll, .overflow-y-scroll, .overflow-x-scroll';

const SKIP_TAGS = new Set(['TEXTAREA', 'INPUT', 'SELECT']);

const LIBRARY_ATTRS = [
  'data-overlayscrollbars-viewport',
  'data-overlayscrollbars-padding',
  'data-overlayscrollbars-contents',
  'data-overlayscrollbars-content',
];

function shouldSkip(el: HTMLElement): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.hasAttribute('data-native-scroll')) return true;
  if (el.closest('[data-native-scroll]') !== null) return true;
  if (LIBRARY_ATTRS.some((attr) => el.hasAttribute(attr))) return true;
  if (el.classList.contains('os-scrollbar')) return true;
  if (OverlayScrollbars(el) !== undefined) return true;
  return false;
}

function hijack(el: HTMLElement) {
  const isTarget = el.className.includes('pt-2.5');
  if (shouldSkip(el)) {
    if (isTarget) console.log('[dbg] skipped target', el);
    return;
  }
  if (isTarget) console.log('[dbg] attempting init on target', el);
  try {
    OverlayScrollbars(el, {
      scrollbars: { theme: 'os-theme-closer', autoHide: 'leave' },
    });
    el.style.overflow = 'hidden';
    console.log('[GlobalScrollbarOverlay] hijacked', el.tagName, 'class=', el.className);
  } catch (err) {
    console.warn('[GlobalScrollbarOverlay] hijack failed', el, err);
  }
}

function scanTree(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(OVERFLOW_SELECTOR).forEach(hijack);
}

function handleAddedNode(node: Node) {
  if (!(node instanceof HTMLElement)) return;
  if (node.querySelector?.('.pt-2\\.5') !== null || node.className?.includes?.('pt-2.5')) {
    console.log('[dbg] observer saw node containing target', node);
  }
  if (node.matches(OVERFLOW_SELECTOR)) hijack(node);
  scanTree(node);
}

function logRemainingScrollContainers() {
  document.body.querySelectorAll<HTMLElement>('*').forEach((el) => {
    if (el.hasAttribute('data-overlayscrollbars-viewport')) return;
    if (el.closest('[data-native-scroll]') !== null) return;
    const style = getComputedStyle(el);
    const v = (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
    const h = (style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1;
    if (!v && !h) return;
    console.log(
      '[offender]',
      el.tagName,
      'class=',
      el.className,
      'data-overlayscrollbars=',
      el.getAttribute('data-overlayscrollbars'),
      'v=',
      v,
      'h=',
      h,
      'el=',
      el
    );
  });
}

function useGlobalScrollbarHijack() {
  useEffect(() => {
    scanTree(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(handleAddedNode);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      logRemainingScrollContainers();
      // Re-scan the tree to see if any offenders were missed
      console.log('[dbg] re-scanning after 500ms');
      scanTree(document.body);
    }, 500);
    return () => observer.disconnect();
  }, []);
}

export function GlobalScrollbarOverlay() {
  useGlobalScrollbarHijack();
  return null;
}

/**
 * Returns the element that actually carries the scroll position for a given
 * container. If the element has been hijacked by OverlayScrollbars, this is
 * its internal viewport child; otherwise it's the element itself. Use this
 * whenever you need to read or write `scrollTop` / `scrollLeft` imperatively
 * on a container that lives under the GlobalScrollbarOverlay.
 */
export function getScrollViewport(el: HTMLElement | null): HTMLElement | null {
  if (el === null) return null;
  const osInstance = OverlayScrollbars(el);
  if (osInstance === undefined) return el;
  const { viewport } = osInstance.elements();
  return viewport instanceof HTMLElement ? viewport : null;
}
