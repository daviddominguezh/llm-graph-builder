'use client';

import { useTranslations } from 'next-intl';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

interface SaveStateIndicatorProps {
  state: SaveState;
  onRetry?: () => void;
}

export function SaveStateIndicator({ state, onRetry }: SaveStateIndicatorProps): React.JSX.Element | null {
  const t = useTranslations('agentTools.saveStates');
  if (state === 'idle') return null;
  if (state === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="text-[11px] text-destructive hover:underline"
      >
        {t('error')}
      </button>
    );
  }
  return (
    <span className="text-[11px] text-muted-foreground">
      {state === 'saving' && t('saving')}
      {state === 'saved' && t('saved')}
      {state === 'conflict' && t('conflict')}
    </span>
  );
}
