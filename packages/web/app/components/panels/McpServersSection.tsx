'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, ChevronDown, Loader2, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { McpServerConfig } from '../../schemas/graph.schema';
import type { McpServerStatus } from '../../hooks/useMcpServers';

interface McpServersSectionProps {
  servers: McpServerConfig[];
  discovering: Record<string, boolean>;
  serverStatus: Record<string, McpServerStatus>;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<McpServerConfig>) => void;
  onDiscover: (id: string) => void;
}

interface ServerItemProps {
  server: McpServerConfig;
  status: McpServerStatus;
  isDiscovering: boolean;
  onRemove: () => void;
  onUpdate: (updates: Partial<McpServerConfig>) => void;
  onDiscover: () => void;
}

interface HeaderEntry {
  key: string;
  value: string;
}

function headersToEntries(headers: Record<string, string> | undefined): HeaderEntry[] {
  if (headers === undefined) return [];
  return Object.entries(headers).map(([key, value]) => ({ key, value }));
}

function entriesToHeaders(entries: HeaderEntry[]): Record<string, string> | undefined {
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map((e) => [e.key, e.value]));
}

function HeaderRow({ entry, onChange, onRemove }: { entry: HeaderEntry; onChange: (e: HeaderEntry) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <Input
        value={entry.key}
        onChange={(e) => onChange({ ...entry, key: e.target.value })}
        placeholder="Header name"
        className="flex-1"
      />
      <Input
        value={entry.value}
        onChange={(e) => onChange({ ...entry, value: e.target.value })}
        placeholder="Value"
        className="flex-1"
      />
      <Button variant="ghost" size="icon-xs" onClick={onRemove}>
        <X className="size-3" />
      </Button>
    </div>
  );
}

function HeadersEditor({ headers, onHeadersChange }: { headers: Record<string, string> | undefined; onHeadersChange: (h: Record<string, string> | undefined) => void }) {
  const entries = headersToEntries(headers);

  function updateEntry(index: number, updated: HeaderEntry): void {
    const next = entries.map((e, i) => (i === index ? updated : e));
    onHeadersChange(entriesToHeaders(next));
  }

  function removeEntry(index: number): void {
    const next = entries.filter((_, i) => i !== index);
    onHeadersChange(entriesToHeaders(next));
  }

  function addEntry(): void {
    onHeadersChange(entriesToHeaders([...entries, { key: '', value: '' }]));
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label>Headers</Label>
        <Button variant="ghost" size="icon-xs" onClick={addEntry}>
          <Plus className="size-3" />
        </Button>
      </div>
      {entries.length > 0 && (
        <div className="space-y-1">
          {entries.map((entry, index) => (
            <HeaderRow
              key={index}
              entry={entry}
              onChange={(e) => updateEntry(index, e)}
              onRemove={() => removeEntry(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
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

function DiscoverButton({ status, isDiscovering, onDiscover }: { status: McpServerStatus; isDiscovering: boolean; onDiscover: () => void }) {
  const isActive = status === 'active';
  const icon = isDiscovering
    ? <Loader2 className="size-4 animate-spin mr-1" />
    : isActive ? <RefreshCw className="size-4 mr-1" /> : <Search className="size-4 mr-1" />;
  const label = isActive ? 'Reload Tools' : 'Discover Tools';

  return (
    <Button variant="outline" size="sm" className="w-full" onClick={onDiscover} disabled={isDiscovering}>
      {icon}
      {label}
    </Button>
  );
}

function ServerItemExpanded({ server, status, isDiscovering, onUpdate, onDiscover }: Omit<ServerItemProps, 'onRemove'>) {
  return (
    <div className="space-y-2 mt-2">
      <div className="space-y-1">
        <Label>Name</Label>
        <Input
          value={server.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
        />
      </div>
      <TransportTypeSelector server={server} onUpdate={onUpdate} />
      <UrlTransportFields server={server} onUpdate={onUpdate} />
      <StdioTransportFields server={server} onUpdate={onUpdate} />
      <DiscoverButton status={status} isDiscovering={isDiscovering} onDiscover={onDiscover} />
    </div>
  );
}

function StatusIcon({ status }: { status: McpServerStatus }) {
  if (status === 'active') {
    return <CheckCircle className="size-3 text-green-500" />;
  }
  return <AlertTriangle className="size-3 text-orange-400" />;
}

function ServerItem({ server, status, isDiscovering, onRemove, onUpdate, onDiscover }: ServerItemProps) {
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
}: McpServersSectionProps) {
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-2">
        <Label>MCP Servers</Label>
        <Button variant="ghost" size="icon-xs" onClick={onAdd}>
          <Plus className="size-3" />
        </Button>
      </div>
      <ul className="space-y-2">
        {servers.map((server) => (
          <ServerItem
            key={server.id}
            server={server}
            status={serverStatus[server.id] ?? 'pending'}
            isDiscovering={discovering[server.id] ?? false}
            onRemove={() => onRemove(server.id)}
            onUpdate={(updates) => onUpdate(server.id, updates)}
            onDiscover={() => onDiscover(server.id)}
          />
        ))}
      </ul>
    </div>
  );
}
