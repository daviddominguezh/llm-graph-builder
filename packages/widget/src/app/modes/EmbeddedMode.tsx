// packages/widget/src/app/modes/EmbeddedMode.tsx
import { Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { CopilotPanel } from '../../ui/CopilotPanel.js';
import { useT } from '../i18nContext.js';
import { postResize } from '../postMessageClient.js';

const MOBILE_BREAKPOINT = 480;
const DESKTOP_VIEWPORT_DEFAULT = 1024;
const CLOSE_ANIMATION_MS = 180;

function useBubbleVisibleAfterClose(open: boolean): boolean {
  const [visible, setVisible] = useState(!open);
  useEffect(() => {
    if (open) {
      setVisible(false);
      return undefined;
    }
    const id = window.setTimeout(() => setVisible(true), CLOSE_ANIMATION_MS);
    return () => window.clearTimeout(id);
  }, [open]);
  return visible;
}

function useEscapeKey(open: boolean, closePanel: () => void): void {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') closePanel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closePanel]);
}

export function EmbeddedMode({ hostViewportW }: { hostViewportW: number | null }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const isMobile = (hostViewportW ?? DESKTOP_VIEWPORT_DEFAULT) < MOBILE_BREAKPOINT;
  const bubbleVisible = useBubbleVisibleAfterClose(open);

  const openPanel = useCallback(() => {
    setOpen(true);
    postResize(isMobile ? 'fullscreen' : 'panel');
  }, [isMobile]);

  const closePanel = useCallback(() => {
    setOpen(false);
    postResize('bubble');
  }, []);

  useEscapeKey(open, closePanel);

  if (!open) {
    if (!bubbleVisible) return null;
    return (
      <button
        type="button"
        aria-label={t('openChat')}
        onClick={openPanel}
        className="cursor-pointer w-full h-full rounded-full bg-primary text-primary-foreground flex items-center justify-center p-3 shadow-lg"
      >
        <Sparkles className="size-4.5" />
      </button>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="openflow-panel-title" className="w-full h-full">
      <CopilotPanel onClose={closePanel} />
    </div>
  );
}
