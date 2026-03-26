'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, BookOpen, CheckCircle, ChevronDown, Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { McpServerStatus } from '../../hooks/useMcpServers';
import { useOAuthStatus } from '../../hooks/useOAuthStatus';
import type { OrgEnvVariableRow } from '../../lib/orgEnvVariables';
import type { McpAuthType, McpLibraryRow } from '../../lib/mcpLibraryTypes';
import type { McpServerConfig } from '../../schemas/graph.schema';
import { LibraryServerFields, areVariablesComplete } from './LibraryServerFields';
import type { VariableValueShape } from './LibraryServerFields';
import { StdioTransportFields, TransportTypeSelector, UrlTransportFields } from './TransportFields';

interface McpServersSectionProps {
  servers: McpServerConfig[];
  discovering: Record<string, boolean>;
  serverStatus: Record<string, McpServerStatus>;
  orgId: string;
  envVariables: OrgEnvVariableRow[];
  libraryItems?: McpLibraryRow[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<McpServerConfig>) => void;
  onDiscover: (id: string) => void;
  onPublish: (server: McpServerConfig) => void;
  onOpenLibrary: () => void;
}

interface ServerItemProps {
  server: McpServerConfig;
  status: McpServerStatus;
  isDiscovering: boolean;
  envVariables: OrgEnvVariableRow[];
  orgId: string;
  authType?: McpAuthType;
  onRemove: () => void;
  onUpdate: (updates: Partial<McpServerConfig>) => void;
  onDiscover: () => void;
  onPublish: () => void;
}

function DiscoverButton({
  status,
  isDiscovering,
  onDiscover,
  disabled,
  className,
}: {
  status: McpServerStatus;
  isDiscovering: boolean;
  onDiscover: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const isActive = status === 'active';
  const label = isActive ? 'Reload Tools' : 'Discover Tools';

  return (
    <Button
      variant="default"
      size="sm"
      className={className}
      onClick={onDiscover}
      disabled={isDiscovering || (disabled ?? false)}
    >
      {isDiscovering ? <Loader2 className="size-3 animate-spin text-white" /> : label}
    </Button>
  );
}

function EditableServerFields({
  server,
  status,
  isDiscovering,
  onUpdate,
  onDiscover,
  onPublish,
}: Omit<ServerItemProps, 'onRemove' | 'envVariables' | 'orgId' | 'authType'>) {
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
        <DiscoverButton
          status={status}
          isDiscovering={isDiscovering}
          onDiscover={onDiscover}
          className="flex-1"
        />
      </div>
    </>
  );
}

interface LibraryExpandedProps {
  server: McpServerConfig;
  status: McpServerStatus;
  isDiscovering: boolean;
  envVariables: OrgEnvVariableRow[];
  orgId: string;
  authType?: McpAuthType;
  onUpdate: (updates: Partial<McpServerConfig>) => void;
  onDiscover: () => void;
}

function LibraryExpandedFields({
  server,
  status,
  isDiscovering,
  envVariables,
  orgId,
  authType,
  onUpdate,
  onDiscover,
}: LibraryExpandedProps) {
  const variableValues = server.variableValues as Record<string, VariableValueShape> | undefined;
  const varsComplete = areVariablesComplete(variableValues);
  const oauthStatus = useOAuthStatus(orgId, authType === 'oauth' ? server.libraryItemId : undefined);

  return (
    <>
      <LibraryServerFields
        server={server}
        envVariables={envVariables}
        authType={authType}
        oauthConnected={oauthStatus.connected}
        onUpdate={onUpdate}
      />
      <DiscoverButton
        status={status}
        isDiscovering={isDiscovering}
        onDiscover={onDiscover}
        disabled={authType !== 'oauth' && !varsComplete}
        className="w-full"
      />
    </>
  );
}

function ServerItemExpanded({
  server,
  status,
  isDiscovering,
  envVariables,
  orgId,
  authType,
  onUpdate,
  onDiscover,
  onPublish,
}: Omit<ServerItemProps, 'onRemove'>) {
  const isFromLibrary = server.libraryItemId !== undefined;

  return (
    <div className="space-y-2 mt-2">
      {isFromLibrary ? (
        <LibraryExpandedFields
          server={server}
          status={status}
          isDiscovering={isDiscovering}
          envVariables={envVariables}
          orgId={orgId}
          authType={authType}
          onUpdate={onUpdate}
          onDiscover={onDiscover}
        />
      ) : (
        <EditableServerFields
          server={server}
          status={status}
          isDiscovering={isDiscovering}
          onUpdate={onUpdate}
          onDiscover={onDiscover}
          onPublish={onPublish}
        />
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: McpServerStatus }) {
  if (status === 'active') {
    return <CheckCircle className="size-3 text-green-500" />;
  }
  return <AlertTriangle className="size-3 text-orange-400" />;
}

function ServerItem({
  server,
  status,
  isDiscovering,
  envVariables,
  orgId,
  authType,
  onRemove,
  onUpdate,
  onDiscover,
  onPublish,
}: ServerItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="rounded-md border px-3 py-2 bg-background">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-1.5 text-xs">
          <ChevronDown className={`size-3 transition-transform ${expanded ? '' : '-rotate-90'}`} />
          <StatusIcon status={status} />
          {server.name}
        </span>
        <Button
          variant="destructive"
          size="icon-xs"
          title="Remove server"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      {expanded && (
        <ServerItemExpanded
          server={server}
          status={status}
          isDiscovering={isDiscovering}
          envVariables={envVariables}
          orgId={orgId}
          authType={authType}
          onUpdate={onUpdate}
          onDiscover={onDiscover}
          onPublish={onPublish}
        />
      )}
    </li>
  );
}

function getAuthType(server: McpServerConfig, libraryItems: McpLibraryRow[]): McpAuthType | undefined {
  if (server.libraryItemId === undefined) return undefined;
  return libraryItems.find((i) => i.id === server.libraryItemId)?.auth_type;
}

export function McpServersSection({
  servers,
  discovering,
  serverStatus,
  envVariables,
  orgId,
  libraryItems,
  onAdd,
  onRemove,
  onUpdate,
  onDiscover,
  onPublish,
  onOpenLibrary,
}: McpServersSectionProps) {
  const items = libraryItems ?? [];

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-2">
        <Label>MCP Servers</Label>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-xs" onClick={onOpenLibrary}>
            <BookOpen className="size-3" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={onAdd}>
            <Plus className="size-3" />
          </Button>
        </div>
      </div>
      <ul className="space-y-2">
        {[...servers]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((server) => (
            <ServerItem
              key={server.id}
              server={server}
              status={serverStatus[server.id] ?? 'pending'}
              isDiscovering={discovering[server.id] ?? false}
              envVariables={envVariables}
              orgId={orgId}
              authType={getAuthType(server, items)}
              onRemove={() => onRemove(server.id)}
              onUpdate={(updates) => onUpdate(server.id, updates)}
              onDiscover={() => onDiscover(server.id)}
              onPublish={() => onPublish(server)}
            />
          ))}
      </ul>
    </div>
  );
}
