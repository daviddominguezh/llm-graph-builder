'use client';

import type { SelectedTool } from '@daviddh/llm-graph-runner';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface StaleEntriesGroupProps {
  staleEntries: SelectedTool[];
  onRemove: (entry: SelectedTool) => void;
}

export function StaleEntriesGroup({ staleEntries, onRemove }: StaleEntriesGroupProps): React.JSX.Element | null {
  const t = useTranslations('agentTools');
  if (staleEntries.length === 0) return null;
  return (
    <div className="px-2 pt-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-1.5">
        <AlertTriangle className="size-3 text-yellow-600 dark:text-yellow-500" />
        {t('staleHeader')}
      </div>
      <ul className="flex flex-col gap-1">
        {staleEntries.map((entry) => (
          <li
            key={`${entry.providerType}:${entry.providerId}:${entry.toolName}`}
            className="flex items-center justify-between text-xs px-2 py-1 rounded-sm bg-card"
          >
            <span className="font-mono text-muted-foreground truncate">
              {entry.providerType}:{entry.providerId}:{entry.toolName}
            </span>
            <Button variant="ghost" size="icon-xs" onClick={() => onRemove(entry)}>
              {t('removeStale')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
