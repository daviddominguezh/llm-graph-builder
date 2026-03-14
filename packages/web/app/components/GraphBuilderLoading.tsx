'use client';

import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ServerProgress } from '../hooks/useMcpDiscovery';

function ServerStatusIcon({
  status,
  className = '',
}: {
  status: ServerProgress['status'];
  className?: string;
}) {
  if (status === 'done') return <CircleCheck className={`size-3 text-green-500 ${className}`} />;
  if (status === 'error') return <CircleAlert className={`size-3 text-red-500 ${className}`} />;
  return <Loader2 className={`size-3 animate-spin text-muted-foreground ${className}`} />;
}

function McpServerList({ servers }: { servers: ServerProgress[] }) {
  const t = useTranslations('editor');

  return (
    <div className="mt-2 flex flex-col items-start gap-1">
      <p className="text-sm text-muted-foreground">{t('connectingMcpServers')}</p>
      <div className="flex flex-col gap-1">
        {servers.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <ServerStatusIcon status={s.status} className={s.status === 'loading' ? 'text-blue-400!' : ''} />
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
    <div className="flex h-full w-full flex-col items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      {hasServers && <McpServerList servers={serverProgress} />}
    </div>
  );
}
