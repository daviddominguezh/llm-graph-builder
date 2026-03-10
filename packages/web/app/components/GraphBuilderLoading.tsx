'use client';

import type { ServerProgress } from '../hooks/useMcpDiscovery';
import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

function ServerStatusIcon({ status }: { status: ServerProgress['status'] }) {
  if (status === 'done') return <CircleCheck className="size-3.5 text-green-500" />;
  if (status === 'error') return <CircleAlert className="size-3.5 text-red-500" />;
  return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
}

function McpServerList({ servers }: { servers: ServerProgress[] }) {
  const t = useTranslations('editor');

  return (
    <div className="mt-4 flex flex-col items-start gap-2">
      <p className="text-sm text-muted-foreground">{t('connectingMcpServers')}</p>
      <div className="flex flex-col gap-1.5">
        {servers.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <ServerStatusIcon status={s.status} />
            <span className="text-xs text-muted-foreground">{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface GraphBuilderLoadingProps {
  serverProgress?: ServerProgress[];
}

export function GraphBuilderLoading({ serverProgress }: GraphBuilderLoadingProps) {
  const hasServers = serverProgress !== undefined && serverProgress.length > 0;

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center">
      <Loader2 className="size-6 animate-spin" />
      {hasServers && <McpServerList servers={serverProgress} />}
    </div>
  );
}
