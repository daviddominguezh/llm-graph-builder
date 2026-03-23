'use client';

import { useTranslations } from 'next-intl';

import type { SessionRow } from '@/app/lib/dashboard';

interface SessionMetadataBarProps {
  session: SessionRow;
  agentName: string;
}

interface MetadataItemProps {
  label: string;
  value: string;
}

function MetadataItem({ label, value }: MetadataItemProps) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="truncate text-xs font-mono">{value}</span>
    </div>
  );
}

export function SessionMetadataBar({ session, agentName }: SessionMetadataBarProps) {
  const t = useTranslations('dashboard.debug');

  const items: MetadataItemProps[] = [
    { label: t('agent'), value: agentName },
    { label: t('version'), value: `v${String(session.version)}` },
    { label: t('tenant'), value: session.tenant_id },
    { label: t('user'), value: session.user_id },
    { label: t('session'), value: session.session_id },
    { label: t('channel'), value: session.channel },
  ];

  return (
    <div className="flex flex-wrap gap-14 rounded-md border p-3 bg-card">
      {items.map((item) => (
        <MetadataItem key={item.label} label={item.label} value={item.value} />
      ))}
    </div>
  );
}
