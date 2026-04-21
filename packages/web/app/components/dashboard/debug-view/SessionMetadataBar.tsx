'use client';

import { TokenDisplay } from '@/app/components/panels/simulation/TokenDisplay';
import type { SessionRow } from '@/app/lib/dashboard';
import { Separator } from '@/components/ui/separator';
import { useTranslations } from 'next-intl';
import React from 'react';

interface SessionMetadataBarProps {
  session: SessionRow;
  agentName: string;
  tenantName?: string;
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
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
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

export function SessionMetadataBar({ session, agentName, tenantName }: SessionMetadataBarProps) {
  const t = useTranslations('dashboard.debug');

  const items: MetadataItemProps[] = [
    { label: t('tenant'), value: tenantName ?? session.tenant_id },
    { label: t('agent'), value: agentName },
    { label: t('version'), value: `v${String(session.version)}` },
    { label: t('user'), value: session.user_id },
    { label: t('channel'), value: session.channel.toUpperCase() },
    { label: t('session'), value: session.session_id },
  ];

  return (
    <div className="px-4 py-3 flex flex-wrap items-end justify-evenly">
      {items.map((item) => (
        <React.Fragment key={`${item.label}-fragment`}>
          <MetadataItem key={item.label} label={item.label} value={item.value} />
          <Separator orientation="vertical" />
        </React.Fragment>
      ))}
      <MetadataItem label={t('createdAt')} value={formatDateTime(session.created_at)} />

      <Separator orientation="vertical" />
      <div className="flex flex-col items-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {t('totalTokens')}
        </span>
        <TokenDisplay tokens={sessionToTokens(session)} className="text-foreground text-xs" />
      </div>
      <Separator orientation="vertical" />
      <MetadataItem label={t('totalCost')} value={formatCost(session.total_cost)} />
    </div>
  );
}
