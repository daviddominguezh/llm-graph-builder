'use client';

import { useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle, ChevronDown, Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { OrgEnvVariableRow } from '../../lib/org-env-variables';
import type { McpServerConfig } from '../../schemas/graph.schema';
import type { McpServerStatus } from '../../hooks/useMcpServers';
import { HeadersEditor } from './HeadersEditor';

interface McpServersSectionProps {
  servers: McpServerConfig[];
  discovering: Record<string, boolean>;
  serverStatus: Record<string, McpServerStatus>;
  orgId: string;
  envVariables: OrgEnvVariableRow[];
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
  onRemove: () => void;
  onUpdate: (updates: Partial<McpServerConfig>) => void;
  onDiscover: () => void;
  onPublish: () => void;
}

function UrlTransportFields({ server, onUpdate }: { server: McpServerConfig; onUpdate: (u: Partial<McpServerConfig>) => void }) {
  const transport = server.transport;
  if (transport.type !== 'sse' && transport.type !== 'http') return null;

  return (
    <>
      <div className="space-y-1">
        <Label>URL</Label>
        <Input
          value={transport.url}
          onChange={(e) => onUpdate({ transport: { ...transport, url: e.target.value } })}
          placeholder="https://example.com/mcp"
        />
      </div>
      <HeadersEditor
        headers={transport.headers}
        onHeadersChange={(h) => onUpdate({ transport: { ...transport, headers: h } })}
      />
    </>
  );
}

function StdioTransportFields({ server, onUpdate }: { server: McpServerConfig; onUpdate: (u: Partial<McpServerConfig>) => void }) {
  const transport = server.transport;
  if (transport.type !== 'stdio') return null;

  return (
    <>
      <div className="space-y-1">
        <Label>Command</Label>
        <Input
          value={transport.command}
          onChange={(e) => onUpdate({ transport: { ...transport, command: e.target.value } })}
          placeholder="npx"
        />
      </div>
      <div className="space-y-1">
        <Label>Arguments</Label>
        <Input
          value={transport.args?.join(' ') ?? ''}
          onChange={(e) =>
            onUpdate({ transport: { ...transport, args: e.target.value.split(' ').filter(Boolean) } })
          }
          placeholder="mcp-server --port 3001"
        />
      </div>
    </>
  );
}

function TransportTypeSelector({
  server,
  onUpdate,
}: {
  server: McpServerConfig;
  onUpdate: (u: Partial<McpServerConfig>) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>Transport</Label>
      <Select
        value={server.transport.type}
        onValueChange={(value) => {
          if (value === 'http') {
            onUpdate({ transport: { type: 'http', url: '' } });
          } else if (value === 'sse') {
            onUpdate({ transport: { type: 'sse', url: '' } });
          } else if (value === 'stdio') {
            onUpdate({ transport: { type: 'stdio', command: '' } });
          }
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="http">HTTP</SelectItem>
          <SelectItem value="sse">SSE</SelectItem>
          <SelectItem value="stdio">Stdio</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function DiscoverButton({
  status,
  isDiscovering,
  onDiscover,
  className,
}: {
  status: McpServerStatus;
  isDiscovering: boolean;
  onDiscover: () => void;
  className?: string;
}) {
  const isActive = status === 'active';
  const icon = isDiscovering ? (
    <Loader2 className="size-4 animate-spin mr-1" />
  ) : isActive ? (
    <RefreshCw className="size-4 mr-1" />
  ) : (
    <Search className="size-4 mr-1" />
  );
  const label = isActive ? 'Reload Tools' : 'Discover Tools';

  return (
    <Button variant="default" size="sm" className={className} onClick={onDiscover} disabled={isDiscovering}>
      {icon}
      {label}
    </Button>
  );
}

function ServerItemExpanded({
  server,
  status,
  isDiscovering,
  onUpdate,
  onDiscover,
  onPublish,
}: Omit<ServerItemProps, 'onRemove'>) {
  return (
    <div className="space-y-2 mt-2">
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
        <DiscoverButton status={status} isDiscovering={isDiscovering} onDiscover={onDiscover} className="flex-1" />
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: McpServerStatus }) {
  if (status === 'active') {
    return <CheckCircle className="size-3 text-green-500" />;
  }
  return <AlertTriangle className="size-3 text-orange-400" />;
}

function ServerItem({ server, status, isDiscovering, onRemove, onUpdate, onDiscover, onPublish }: ServerItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="rounded-md border px-3 py-2">
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
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      {expanded && (
        <ServerItemExpanded
          server={server}
          status={status}
          isDiscovering={isDiscovering}
          onUpdate={onUpdate}
          onDiscover={onDiscover}
          onPublish={onPublish}
        />
      )}
    </li>
  );
}

export function McpServersSection({
  servers,
  discovering,
  serverStatus,
  onAdd,
  onRemove,
  onUpdate,
  onDiscover,
  onPublish,
  onOpenLibrary,
}: McpServersSectionProps) {
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
        {[...servers].sort((a, b) => a.name.localeCompare(b.name)).map((server) => (
          <ServerItem
            key={server.id}
            server={server}
            status={serverStatus[server.id] ?? 'pending'}
            isDiscovering={discovering[server.id] ?? false}
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
