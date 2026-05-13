'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSWRConfig } from 'swr';

import type { ToolGroup } from '../../lib/toolRegistryTypes';

interface ProviderErrorRowProps {
  agentId?: string;
  mode: 'agent' | 'workflow';
}

function buildRegistryKey(agentId: string): string {
  return `/api/agents/${encodeURIComponent(agentId)}/registry`;
}

function isAnyRegistryKey(key: unknown): boolean {
  return typeof key === 'string' && key.endsWith('/registry');
}

export function ProviderErrorRow({ agentId, mode }: ProviderErrorRowProps): React.JSX.Element {
  const t = useTranslations('agentTools');
  const { mutate } = useSWRConfig();
  const noteKey = mode === 'agent' ? 'providerErrorAgentNote' : 'providerErrorWorkflowNote';
  const handleRetry = (): void => {
    if (agentId !== undefined && agentId.length > 0) {
      void mutate(buildRegistryKey(agentId));
    } else {
      void mutate(isAnyRegistryKey);
    }
  };
  return (
    <div className="px-3 pb-1">
      <div className="flex items-center gap-2 text-[11px] text-destructive">
        <AlertTriangle className="size-3 shrink-0" />
        <span>{t('providerError')}</span>
        <button type="button" onClick={handleRetry} className="underline cursor-pointer">
          {t('retry')}
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground pl-5">{t(noteKey)}</p>
    </div>
  );
}

export function groupProviderId(group: ToolGroup): string | null {
  const first = group.tools[0];
  if (first === undefined) return null;
  const sourceId = first.sourceId;
  if (sourceId.startsWith('__') && sourceId.endsWith('__')) {
    return sourceId.slice(2, -2);
  }
  return sourceId;
}
