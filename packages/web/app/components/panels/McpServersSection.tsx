'use client';

import { useState } from 'react';
import { ChevronDown, Loader2, Plus, Search, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { McpServerConfig } from '../../schemas/graph.schema';
import type { DiscoveredTool } from '../../lib/api';

interface McpServersSectionProps {
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
  discovering: Record<string, boolean>;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<McpServerConfig>) => void;
  onDiscover: (id: string) => void;
}

interface ServerItemProps {
  server: McpServerConfig;
  tools: DiscoveredTool[];
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

function ToolsList({ tools }: { tools: DiscoveredTool[] }) {
  if (tools.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      <Label>Discovered Tools</Label>
      <ul className="space-y-1">
        {tools.map((tool) => (
          <li key={tool.name} className="rounded border px-2 py-1">
            <span className="font-medium">{tool.name}</span>
            {tool.description !== undefined && (
              <p className="text-muted-foreground text-xs mt-0.5">{tool.description}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
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

function ServerItemExpanded({ server, tools, isDiscovering, onUpdate, onDiscover }: Omit<ServerItemProps, 'onRemove'>) {
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
      <Button variant="outline" size="sm" className="w-full" onClick={onDiscover} disabled={isDiscovering}>
        {isDiscovering ? <Loader2 className="size-4 animate-spin mr-1" /> : <Search className="size-4 mr-1" />}
        Discover Tools
      </Button>
      <ToolsList tools={tools} />
    </div>
  );
}

function ServerItem({ server, tools, isDiscovering, onRemove, onUpdate, onDiscover }: ServerItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="rounded-md border px-3 py-2">
      <div className="flex items-center justify-between">
        <button className="flex items-center gap-1.5 text-sm font-medium" onClick={() => setExpanded(!expanded)}>
          <ChevronDown className={`size-3 transition-transform ${expanded ? '' : '-rotate-90'}`} />
          {server.name}
          <Badge variant="outline" className="ml-1">
            {server.transport.type}
          </Badge>
        </button>
        <Button variant="destructive" size="icon-xs" title="Remove server" onClick={onRemove}>
          <Trash2 className="size-3" />
        </Button>
      </div>
      {expanded && (
        <ServerItemExpanded
          server={server}
          tools={tools}
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
  discoveredTools,
  discovering,
  onAdd,
  onRemove,
  onUpdate,
  onDiscover,
}: McpServersSectionProps) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <Label className="font-semibold">MCP Servers</Label>
        <Button variant="ghost" size="icon-xs" onClick={onAdd}>
          <Plus className="size-3" />
        </Button>
      </div>
      <ul className="space-y-2">
        {servers.map((server) => (
          <ServerItem
            key={server.id}
            server={server}
            tools={discoveredTools[server.id] ?? []}
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
