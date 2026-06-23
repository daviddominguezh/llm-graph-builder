'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

import type { McpServerStatus } from '../../hooks/useMcpServers';
import { useOAuthStatus } from '../../hooks/useOAuthStatus';
import type { McpAuthType } from '../../lib/mcpLibraryTypes';
import type { OrgEnvVariableRow } from '../../lib/orgEnvVariables';
import type { McpServerConfig } from '../../schemas/graph.schema';
import { LibraryServerFields } from './LibraryServerFields';
import { StdioTransportFields, TransportTypeSelector, UrlTransportFields } from './TransportFields';

interface DiscoverButtonProps {
  status: McpServerStatus;
  isDiscovering: boolean;
  onDiscover: () => void;
  disabled?: boolean;
}

function DiscoverButton({ status, isDiscovering, onDiscover, disabled }: DiscoverButtonProps) {
  const isActive = status === 'active';
  const label = isActive ? 'Reload Tools' : 'Discover Tools';

  return (
    <Button
      variant="default"
      size="sm"
      className="relative w-fit"
      onClick={onDiscover}
      disabled={isDiscovering || (disabled ?? false)}
    >
      <span className={isDiscovering ? 'invisible' : undefined}>{label}</span>
      {isDiscovering && <Loader2 className="absolute inset-0 m-auto size-3 animate-spin" />}
    </Button>
  );
}

interface EditableServerFieldsProps {
  server: McpServerConfig;
  status: McpServerStatus;
  isDiscovering: boolean;
  onUpdate: (updates: Partial<McpServerConfig>) => void;
  onDiscover: () => void;
  onPublish: () => void;
}

function EditableServerFields(props: EditableServerFieldsProps) {
  const { server, status, isDiscovering, onUpdate, onDiscover, onPublish } = props;
  return (
    <>
      <div className="space-y-1">
        <Label>Name</Label>
        <Input value={server.name} onChange={(e) => onUpdate({ name: e.target.value })} />
      </div>
      <TransportTypeSelector server={server} onUpdate={onUpdate} />
      <UrlTransportFields server={server} onUpdate={onUpdate} />
      <StdioTransportFields server={server} onUpdate={onUpdate} />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onPublish}>
          Publish
        </Button>
        <DiscoverButton status={status} isDiscovering={isDiscovering} onDiscover={onDiscover} />
      </div>
    </>
  );
}

interface LibraryFieldsProps {
  server: McpServerConfig;
  status: McpServerStatus;
  isDiscovering: boolean;
  envVariables: OrgEnvVariableRow[];
  orgId: string;
  authType?: McpAuthType;
  onUpdate: (updates: Partial<McpServerConfig>) => void;
  onDiscover: () => void;
}

function LibraryFields(props: LibraryFieldsProps) {
  const { server, status, isDiscovering, orgId, authType, onDiscover } = props;
  const oauthStatus = useOAuthStatus(orgId, authType === 'oauth' ? server.libraryItemId : undefined);

  return (
    <>
      <LibraryServerFields server={server} authType={authType} oauthConnected={oauthStatus.connected} />
      <div className="w-full flex justify-end my-1.5 mt-3.5">
        <DiscoverButton status={status} isDiscovering={isDiscovering} onDiscover={onDiscover} />
      </div>
    </>
  );
}

export interface ServerDefinitionFieldsProps {
  server: McpServerConfig;
  status: McpServerStatus;
  isDiscovering: boolean;
  envVariables: OrgEnvVariableRow[];
  orgId: string;
  authType?: McpAuthType;
  onUpdate: (updates: Partial<McpServerConfig>) => void;
  onDiscover: () => void;
  onPublish: () => void;
}

export function ServerDefinitionFields(props: ServerDefinitionFieldsProps) {
  const isFromLibrary = props.server.libraryItemId !== undefined;
  if (isFromLibrary) {
    return (
      <LibraryFields
        server={props.server}
        status={props.status}
        isDiscovering={props.isDiscovering}
        envVariables={props.envVariables}
        orgId={props.orgId}
        authType={props.authType}
        onUpdate={props.onUpdate}
        onDiscover={props.onDiscover}
      />
    );
  }
  return (
    <EditableServerFields
      server={props.server}
      status={props.status}
      isDiscovering={props.isDiscovering}
      onUpdate={props.onUpdate}
      onDiscover={props.onDiscover}
      onPublish={props.onPublish}
    />
  );
}
