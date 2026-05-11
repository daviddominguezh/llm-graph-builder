'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function NoServerVersionBadge(): React.JSX.Element {
  const t = useTranslations('mcpServers');
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="shrink-0 inline-flex items-center gap-1 rounded px-1 py-px text-[10px] font-normal normal-case tracking-normal text-amber-600 dark:text-amber-400 bg-amber-500/10"
            aria-label={t('noVersionBadge')}
          >
            <AlertTriangle className="size-2.5" />
            {t('noVersionBadge')}
          </span>
        }
      />
      <TooltipContent side="top">{t('noVersionTooltip')}</TooltipContent>
    </Tooltip>
  );
}
