'use client';

import { OverlayScrollbars } from 'overlayscrollbars';
import { useEffect } from 'react';

const OVERFLOW_SELECTOR =
  '.overflow-auto, .overflow-y-auto, .overflow-x-auto, .overflow-scroll, .overflow-y-scroll, .overflow-x-scroll';

const SKIP_TAGS = new Set(['TEXTAREA', 'INPUT', 'SELECT']);

function shouldSkip(el: HTMLElement): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.hasAttribute('data-native-scroll')) return true;
  if (el.closest('[data-native-scroll]') !== null) return true;
  if (el.closest('[data-overlayscrollbars-initialize]') !== null) return true;
  if (el.closest('[data-overlayscrollbars]') !== null) return true;
  if (OverlayScrollbars(el) !== undefined) return true;
  return false;
}

function hijack(el: HTMLElement) {
  if (shouldSkip(el)) return;
  try {
    OverlayScrollbars(el, {
      scrollbars: { theme: 'os-theme-closer', autoHide: 'leave' },
    });
  } catch {
    /* ignore init failures on transient elements */
  }
}

function scanTree(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(OVERFLOW_SELECTOR).forEach(hijack);
}

function handleAddedNode(node: Node) {
  if (!(node instanceof HTMLElement)) return;
  if (node.matches(OVERFLOW_SELECTOR)) hijack(node);
  scanTree(node);
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
    return () => observer.disconnect();
  }, []);
}

export function GlobalScrollbarOverlay() {
  useGlobalScrollbarHijack();
  return null;
}
