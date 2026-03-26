'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { McpServerConfig } from '@/app/schemas/graph.schema';

import { HeadersEditor } from './HeadersEditor';

type UpdateFn = (u: Partial<McpServerConfig>) => void;

export function UrlTransportFields({ server, onUpdate }: { server: McpServerConfig; onUpdate: UpdateFn }) {
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

export function StdioTransportFields({ server, onUpdate }: { server: McpServerConfig; onUpdate: UpdateFn }) {
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

export function TransportTypeSelector({ server, onUpdate }: { server: McpServerConfig; onUpdate: UpdateFn }) {
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
