'use client';

import { TokenDisplay } from '@/app/components/panels/simulation/TokenDisplay';
import type { SessionRow } from '@/app/lib/dashboard';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React, { useState } from 'react';

const TRUNCATE_LEN = 7;
const COPIED_FEEDBACK_MS = 1500;

interface SessionMetadataBarProps {
  session: SessionRow;
  agentName: string;
  tenantName?: string;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const date = `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
}

function truncateValue(value: string): string {
  return value.length > TRUNCATE_LEN ? `${value.slice(0, TRUNCATE_LEN)}...` : value;
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

interface MetadataLabelProps {
  children: React.ReactNode;
}

function MetadataLabel({ children }: MetadataLabelProps) {
  return (
    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
      {children}
    </span>
  );
}

interface MetadataItemProps {
  label: string;
  value: string;
}

function MetadataItem({ label, value }: MetadataItemProps) {
  return (
    <div className="flex flex-col items-center">
      <MetadataLabel>{label}</MetadataLabel>
      <span className="truncate text-xs font-mono">{value}</span>
    </div>
  );
}

interface CopyableMetadataItemProps {
  label: string;
  fullValue: string;
}

function useCopyToClipboard(value: string): { copied: boolean; copy: () => void } {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    });
  };
  return { copied, copy };
}

function CopyableMetadataItem({ label, fullValue }: CopyableMetadataItemProps) {
  const t = useTranslations('dashboard.debug');
  const { copied, copy } = useCopyToClipboard(fullValue);

  return (
    <div className="flex flex-col items-center">
      <MetadataLabel>{label}</MetadataLabel>
      <div className="flex items-center gap-0.5">
        <span className="text-xs font-mono" title={fullValue}>
          {truncateValue(fullValue)}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={copy}
          title={copied ? t('copied') : t('copy')}
          aria-label={copied ? t('copied') : t('copy')}
          className="text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="size-2.5" /> : <Copy className="size-2.5" />}
        </Button>
      </div>
    </div>
  );
}

interface MetadataBarItem {
  label: string;
  value: string;
}

function useStaticMetadataItems(
  t: (key: string) => string,
  session: SessionRow,
  agentName: string,
  tenantName?: string
): MetadataBarItem[] {
  return [
    { label: t('tenant'), value: tenantName ?? session.tenant_id },
    { label: t('agent'), value: agentName },
    { label: t('version'), value: `v${String(session.version)}` },
  ];
}

interface MetadataTokensAndCostProps {
  session: SessionRow;
}

function MetadataTokensAndCost({ session }: MetadataTokensAndCostProps) {
  const t = useTranslations('dashboard.debug');
  return (
    <>
      <div className="flex flex-col items-center">
        <MetadataLabel>{t('totalTokens')}</MetadataLabel>
        <TokenDisplay tokens={sessionToTokens(session)} className="text-foreground text-xs" />
      </div>
      <Separator orientation="vertical" />
      <MetadataItem label={t('totalCost')} value={formatCost(session.total_cost)} />
    </>
  );
}

export function SessionMetadataBar({ session, agentName, tenantName }: SessionMetadataBarProps) {
  const t = useTranslations('dashboard.debug');
  const staticItems = useStaticMetadataItems(t, session, agentName, tenantName);

  return (
    <div className="px-4 py-3 flex flex-wrap items-end justify-evenly">
      {staticItems.map((item) => (
        <React.Fragment key={`${item.label}-fragment`}>
          <MetadataItem label={item.label} value={item.value} />
          <Separator orientation="vertical" />
        </React.Fragment>
      ))}
      <CopyableMetadataItem label={t('user')} fullValue={session.user_id} />
      <Separator orientation="vertical" />
      <MetadataItem label={t('channel')} value={session.channel.toUpperCase()} />
      <Separator orientation="vertical" />
      <CopyableMetadataItem label={t('session')} fullValue={session.session_id} />
      <Separator orientation="vertical" />
      <MetadataItem label={t('createdAt')} value={formatDateTime(session.created_at)} />
      <Separator orientation="vertical" />
      <MetadataTokensAndCost session={session} />
    </div>
  );
}
