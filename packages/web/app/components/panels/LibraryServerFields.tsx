'use client';

import type { OrgEnvVariableRow } from '@/app/lib/orgEnvVariables';
import { extractVariableNames } from '@/app/lib/resolveVariables';
import type { McpAuthType } from '@/app/lib/mcpLibraryTypes';
import type { McpServerConfig } from '@/app/schemas/graph.schema';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';

import { VariableValuesEditor } from './VariableValuesEditor';
import type { VariableValue } from './VariableValuesEditor';

interface LibraryServerFieldsProps {
  server: McpServerConfig;
  envVariables: OrgEnvVariableRow[];
  authType?: McpAuthType;
  oauthConnected?: boolean;
  onUpdate: (updates: Partial<McpServerConfig>) => void;
}

export interface VariableValueShape {
  type: string;
  value?: string;
  envVariableId?: string;
}

export function areVariablesComplete(
  variableValues: Record<string, VariableValueShape> | undefined
): boolean {
  if (variableValues === undefined) return true;
  return Object.values(variableValues).every((v) =>
    v.type === 'direct' ? (v.value ?? '') !== '' : (v.envVariableId ?? '') !== ''
  );
}

function buildVariableList(server: McpServerConfig): Array<{ name: string }> {
  return extractVariableNames(server.transport).map((name) => ({ name }));
}

function getTransportEndpoint(transport: McpServerConfig['transport']): string {
  if (transport.type === 'stdio') return transport.command;
  return transport.url;
}

function getEndpointLabel(transport: McpServerConfig['transport']): string {
  return transport.type === 'stdio' ? 'Command' : 'URL';
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

function VariableSection({
  server,
  envVariables,
  onUpdate,
}: Pick<LibraryServerFieldsProps, 'server' | 'envVariables' | 'onUpdate'>) {
  const variables = buildVariableList(server);
  const values = (server.variableValues ?? {}) as Record<string, VariableValue>;

  function handleVariableChange(newValues: Record<string, VariableValue>): void {
    onUpdate({ variableValues: newValues as McpServerConfig['variableValues'] });
  }

  if (variables.length === 0) return null;

  return (
    <VariableValuesEditor
      variables={variables}
      values={values}
      envVariables={envVariables}
      onChange={handleVariableChange}
    />
  );
}

export function LibraryServerFields({
  server,
  envVariables,
  authType,
  oauthConnected,
  onUpdate,
}: LibraryServerFieldsProps) {
  const t = useTranslations('mcpLibrary');
  const isOAuth = authType === 'oauth';

  return (
    <div className="space-y-2 mt-2">
      <p className="text-xs text-muted-foreground">{t('readOnlyConfig')}</p>
      <div className="space-y-1">
        <Label>Name</Label>
        <Input value={server.name} disabled />
      </div>
      <div className="space-y-1">
        <Label>{getEndpointLabel(server.transport)}</Label>
        <Input value={getTransportEndpoint(server.transport)} disabled />
      </div>
      {isOAuth ? (
        <OAuthStatus connected={oauthConnected ?? false} />
      ) : (
        <VariableSection server={server} envVariables={envVariables} onUpdate={onUpdate} />
      )}
    </div>
  );
}
