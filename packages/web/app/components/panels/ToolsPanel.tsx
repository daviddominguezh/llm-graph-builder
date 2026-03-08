'use client';

import { X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { DiscoveredTool } from '../../lib/api';
import type { McpServerConfig } from '../../schemas/graph.schema';

interface ToolsPanelProps {
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
  onClose: () => void;
}

function ServerToolGroup({ server, tools }: { server: McpServerConfig; tools: DiscoveredTool[] }) {
  if (tools.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{server.name}</Label>
      <ul className="space-y-1">
        {tools.map((tool) => (
          <li key={tool.name} className="rounded border px-2 py-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="font-medium">{tool.name}</span>
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                {server.transport.type}
              </Badge>
            </div>
            {tool.description !== undefined && (
              <p className="text-muted-foreground text-[10px] mt-0.5">{tool.description}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState() {
  return (
    <p className="text-xs text-muted-foreground text-center py-8">
      No tools discovered yet. Configure MCP servers in the Presets panel and click &quot;Discover Tools&quot;.
    </p>
  );
}

function ToolsList({ servers, discoveredTools }: Omit<ToolsPanelProps, 'onClose'>) {
  const hasTools = servers.some((s) => (discoveredTools[s.id]?.length ?? 0) > 0);

  if (!hasTools) return <EmptyState />;

  return (
    <div className="space-y-4">
      {servers.map((server) => (
        <ServerToolGroup
          key={server.id}
          server={server}
          tools={discoveredTools[server.id] ?? []}
        />
      ))}
    </div>
  );
}

export function ToolsPanel({ servers, discoveredTools, onClose }: ToolsPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b">
        <Label className="text-sm font-semibold">MCP Tools</Label>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <X className="size-3" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <ToolsList servers={servers} discoveredTools={discoveredTools} />
      </div>
    </div>
  );
}
