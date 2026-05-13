'use client';

import { useTranslations } from 'next-intl';
import { useSWRConfig } from 'swr';

interface PanelTotalFailureStateProps {
  reason: string;
}

function isRegistryKey(key: unknown): boolean {
  return typeof key === 'string' && key.endsWith('/registry');
}

export function PanelTotalFailureState({ reason }: PanelTotalFailureStateProps): React.JSX.Element {
  const t = useTranslations('agentTools');
  const { mutate } = useSWRConfig();
  const handleRefresh = (): void => {
    void mutate(isRegistryKey);
  };
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center px-4">
      <p className="text-xs text-destructive">{t('registryTotalFailure')}</p>
      <p className="text-[10px] text-muted-foreground break-all">{reason}</p>
      <button
        type="button"
        onClick={handleRefresh}
        className="text-xs underline cursor-pointer"
      >
        {t('refreshToolsButton')}
      </button>
    </div>
  );
}
