'use client';

import type { McpAuthType } from '@/app/lib/mcpLibraryTypes';
import type { McpServerConfig } from '@/app/schemas/graph.schema';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';

interface LibraryServerFieldsProps {
  server: McpServerConfig;
  authType?: McpAuthType;
  oauthConnected?: boolean;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} disabled />
    </div>
  );
}

function KeyValueView({ label, entries }: { label: string; entries: Array<[string, string]> }) {
  if (entries.length === 0) return null;

  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex flex-col gap-1">
        {entries.map(([key, value]) => (
          <div key={key} className="flex gap-2">
            <Input value={key} disabled className="flex-1 font-mono text-xs" />
            <Input value={value} disabled className="flex-1 font-mono text-xs" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TransportFieldsView({ transport }: { transport: McpServerConfig['transport'] }) {
  if (transport.type === 'stdio') {
    const args = transport.args ?? [];
    return (
      <>
        <ReadOnlyField label="Command" value={transport.command} />
        {args.length > 0 && <ReadOnlyField label="Arguments" value={args.join(' ')} />}
        <KeyValueView label="Environment" entries={Object.entries(transport.env ?? {})} />
      </>
    );
  }

  return (
    <>
      <ReadOnlyField label="URL" value={transport.url} />
      <KeyValueView label="Headers" entries={Object.entries(transport.headers ?? {})} />
    </>
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
  const t = useTranslations('mcpLibrary');

  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="text-xs font-semibold">{t('readOnlyConfig')}</p>
      <div className="pl-3 border-l-2 flex flex-col gap-2 mb-1.5">
        <ReadOnlyField label="Name" value={server.name} />
        <ReadOnlyField label="Transport" value={server.transport.type.toUpperCase()} />
        <TransportFieldsView transport={server.transport} />
      </div>
      {authType === 'oauth' && <OAuthStatus connected={oauthConnected ?? false} />}
    </div>
  );
}
