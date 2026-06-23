'use client';

import type { McpAuthType } from '@/app/lib/mcpLibraryTypes';
import type { McpServerConfig } from '@/app/schemas/graph.schema';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';

interface LibraryServerFieldsProps {
  server: McpServerConfig;
  authType?: McpAuthType;
  oauthConnected?: boolean;
}

function InlineField({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-muted-foreground">{label}:</span> {value}
    </span>
  );
}

function KeyValueSection({ label, entries }: { label: string; entries: Array<[string, string]> }) {
  if (entries.length === 0) return null;

  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-col gap-0.5 font-mono text-xs">
        {entries.map(([key, value]) => (
          <div key={key} className="flex gap-1.5">
            <span className="text-muted-foreground">{key}:</span>
            <span className="truncate">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InlineScalars({ transport, name }: { transport: McpServerConfig['transport']; name: string }) {
  if (transport.type === 'stdio') {
    const args = transport.args ?? [];
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <InlineField label="Name" value={name} />
        <InlineField label="Command" value={transport.command} />
        {args.length > 0 && <InlineField label="Arguments" value={args.join(' ')} />}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <InlineField label="Name" value={name} />
      <InlineField label="URL" value={transport.url} />
    </div>
  );
}

function OAuthStatus({ connected }: { connected: boolean }) {
  const t = useTranslations('mcpLibrary');
  if (connected) {
    return (
      <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
        {t('oauthConnected')}
      </Badge>
    );
  }
  return <p className="text-xs text-muted-foreground">{t('oauthRequired')}</p>;
}

export function LibraryServerFields({ server, authType, oauthConnected }: LibraryServerFieldsProps) {
  const { transport } = server;
  const headers = transport.type === 'stdio' ? [] : Object.entries(transport.headers ?? {});
  const env = transport.type === 'stdio' ? Object.entries(transport.env ?? {}) : [];

  return (
    <div className="flex flex-col gap-2 pl-3 border-l-2">
      <InlineScalars transport={transport} name={server.name} />
      <KeyValueSection label="Headers" entries={headers} />
      <KeyValueSection label="Environment" entries={env} />
      {authType === 'oauth' && <OAuthStatus connected={oauthConnected ?? false} />}
    </div>
  );
}
