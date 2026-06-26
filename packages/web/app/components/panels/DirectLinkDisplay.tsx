'use client';

import { useTranslations } from 'next-intl';

import { CopyButton } from './PublishButtonShared';

const WIDGET_DOMAIN = 'live.openflow.build';

export function buildDirectLink(tenantSlug: string, agentSlug: string): string {
  return `https://${tenantSlug}-${agentSlug}.${WIDGET_DOMAIN}`;
}

interface DirectLinkDisplayProps {
  tenantSlug: string;
  agentSlug: string;
  disabled?: boolean;
}

export function DirectLinkDisplay({ tenantSlug, agentSlug, disabled = false }: DirectLinkDisplayProps) {
  const t = useTranslations('editor');
  const url = buildDirectLink(tenantSlug, agentSlug);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium cursor-default">{t('directLink')}</span>
        <CopyButton text={url} disabled={disabled} />
      </div>
      <div className="flex flex-col gap-1 py-2 px-2 rounded-sm bg-[rgb(250_250_250)] dark:bg-[rgb(40_44_52)]">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:no-underline break-all"
          style={{ opacity: disabled ? 0.4 : 1 }}
        >
          {url}
        </a>
        <p className="text-[10px] text-muted-foreground cursor-default">{t('directLinkHint')}</p>
      </div>
    </div>
  );
}
