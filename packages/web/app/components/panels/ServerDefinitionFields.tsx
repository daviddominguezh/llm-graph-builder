'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';

import { useOAuthStatus } from '../../hooks/useOAuthStatus';
import type { McpAuthType } from '../../lib/mcpLibraryTypes';
import type { OrgEnvVariableRow } from '../../lib/orgEnvVariables';
import type { McpServerConfig } from '../../schemas/graph.schema';
import { LibraryServerFields } from './LibraryServerFields';
import { StdioTransportFields, TransportTypeSelector, UrlTransportFields } from './TransportFields';

interface EditableServerFieldsProps {
  server: McpServerConfig;
  onUpdate: (updates: Partial<McpServerConfig>) => void;
  onPublish: () => void;
}

function EditableServerFields(props: EditableServerFieldsProps) {
  const { server, onUpdate, onPublish } = props;
  const t = useTranslations('mcpMatrix');
  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-1">
        <Label>{t('fieldName')}</Label>
        <Input value={server.name} onChange={(e) => onUpdate({ name: e.target.value })} />
      </div>
      <TransportTypeSelector server={server} onUpdate={onUpdate} />
      <UrlTransportFields server={server} onUpdate={onUpdate} />
      <StdioTransportFields server={server} onUpdate={onUpdate} />
      <div className="flex border-t border-border/60 pt-3">
        <Button variant="outline" size="sm" className="flex-1" onClick={onPublish}>
          {t('publish')}
        </Button>
      </div>
    </div>
  );
}

interface LibraryFieldsProps {
  server: McpServerConfig;
  orgId: string;
  authType?: McpAuthType;
}

function LibraryFields(props: LibraryFieldsProps) {
  const { server, orgId, authType } = props;
  const oauthStatus = useOAuthStatus(orgId, authType === 'oauth' ? server.libraryItemId : undefined);

  return <LibraryServerFields server={server} authType={authType} oauthConnected={oauthStatus.connected} />;
}

export interface ServerDefinitionFieldsProps {
  server: McpServerConfig;
  envVariables: OrgEnvVariableRow[];
  orgId: string;
  authType?: McpAuthType;
  onUpdate: (updates: Partial<McpServerConfig>) => void;
  onPublish: () => void;
}

export function ServerDefinitionFields(props: ServerDefinitionFieldsProps) {
  const isFromLibrary = props.server.libraryItemId !== undefined;
  if (isFromLibrary) {
    return <LibraryFields server={props.server} orgId={props.orgId} authType={props.authType} />;
  }
  return <EditableServerFields server={props.server} onUpdate={props.onUpdate} onPublish={props.onPublish} />;
}
