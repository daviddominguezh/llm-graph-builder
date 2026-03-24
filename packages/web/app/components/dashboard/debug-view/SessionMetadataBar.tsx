'use client';

import { useTranslations } from 'next-intl';

import { TokenDisplay } from '@/app/components/panels/simulation/TokenDisplay';
import type { SessionRow } from '@/app/lib/dashboard';

interface SessionMetadataBarProps {
  session: SessionRow;
  agentName: string;
}

interface MetadataItemProps {
  label: string;
  value: string;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const date = `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
}

function MetadataItem({ label, value }: MetadataItemProps) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="truncate text-xs font-mono">{value}</span>
    </div>
  );
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function sessionToTokens(session: SessionRow) {
  return {
    input: session.total_input_tokens,
    output: session.total_output_tokens,
    cached: 0,
  };
}

export function SessionMetadataBar({ session, agentName }: SessionMetadataBarProps) {
  const t = useTranslations('dashboard.debug');

  const items: MetadataItemProps[] = [
    { label: t('agent'), value: agentName },
    { label: t('version'), value: `v${String(session.version)}` },
    { label: t('tenant'), value: session.tenant_id },
    { label: t('user'), value: session.user_id },
    { label: t('session'), value: session.session_id },
    { label: t('channel'), value: session.channel.toUpperCase() },
  ];

  return (
    <div className="flex flex-wrap items-end justify-around rounded-md border bg-card p-3">
      {items.map((item) => (
        <MetadataItem key={item.label} label={item.label} value={item.value} />
      ))}
      <MetadataItem label={t('totalCost')} value={formatCost(session.total_cost)} />
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('totalTokens')}</span>
        <TokenDisplay tokens={sessionToTokens(session)} className="text-foreground text-xs" />
      </div>
      <MetadataItem label={t('createdAt')} value={formatDateTime(session.created_at)} />
    </div>
  );
}
