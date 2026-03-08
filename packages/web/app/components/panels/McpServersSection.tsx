'use client';

import { useState } from 'react';
import { ChevronDown, Loader2, Plus, Search, Trash2 } from 'lucide-react';

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

function SseTransportFields({ server, onUpdate }: { server: McpServerConfig; onUpdate: (u: Partial<McpServerConfig>) => void }) {
  const transport = server.transport;
  if (transport.type !== 'sse') return null;

  return (
    <div className="space-y-1">
      <Label className="text-[10px]">URL</Label>
      <Input
        value={transport.url}
        onChange={(e) => onUpdate({ transport: { ...transport, url: e.target.value } })}
        placeholder="http://localhost:3001/sse"
        className="h-6 text-xs"
      />
    </div>
  );
}

function StdioTransportFields({ server, onUpdate }: { server: McpServerConfig; onUpdate: (u: Partial<McpServerConfig>) => void }) {
  const transport = server.transport;
  if (transport.type !== 'stdio') return null;

  return (
    <>
      <div className="space-y-1">
        <Label className="text-[10px]">Command</Label>
        <Input
          value={transport.command}
          onChange={(e) => onUpdate({ transport: { ...transport, command: e.target.value } })}
          placeholder="npx"
          className="h-6 text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">Arguments</Label>
        <Input
          value={transport.args?.join(' ') ?? ''}
          onChange={(e) =>
            onUpdate({ transport: { ...transport, args: e.target.value.split(' ').filter(Boolean) } })
          }
          placeholder="mcp-server --port 3001"
          className="h-6 text-xs"
        />
      </div>
    </>
  );
}

function ToolsList({ tools }: { tools: DiscoveredTool[] }) {
  if (tools.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      <Label className="text-[10px]">Discovered Tools</Label>
      <ul className="space-y-1">
        {tools.map((tool) => (
          <li key={tool.name} className="rounded border px-2 py-1 text-xs">
            <span className="font-medium">{tool.name}</span>
            {tool.description !== undefined && (
              <p className="text-muted-foreground text-[10px] mt-0.5">{tool.description}</p>
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
      <Label className="text-[10px]">Transport</Label>
      <Select
        value={server.transport.type}
        onValueChange={(value) => {
          if (value === 'sse') {
            onUpdate({ transport: { type: 'sse', url: '' } });
          } else if (value === 'stdio') {
            onUpdate({ transport: { type: 'stdio', command: '' } });
          }
        }}
      >
        <SelectTrigger className="h-6 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
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
        <Label className="text-[10px]">Name</Label>
        <Input
          value={server.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="h-6 text-xs"
        />
      </div>
      <TransportTypeSelector server={server} onUpdate={onUpdate} />
      <SseTransportFields server={server} onUpdate={onUpdate} />
      <StdioTransportFields server={server} onUpdate={onUpdate} />
      <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={onDiscover} disabled={isDiscovering}>
        {isDiscovering ? <Loader2 className="size-3 animate-spin mr-1" /> : <Search className="size-3 mr-1" />}
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
        <button className="flex items-center gap-1.5 text-xs font-medium" onClick={() => setExpanded(!expanded)}>
          <ChevronDown className={`size-3 transition-transform ${expanded ? '' : '-rotate-90'}`} />
          {server.name}
          <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
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
        <Label className="text-xs font-semibold">MCP Servers</Label>
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
