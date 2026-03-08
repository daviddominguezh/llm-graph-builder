'use client';

import { useState } from 'react';
import { ChevronDown, Wrench } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { DiscoveredTool } from '../../lib/api';
import type { McpServerConfig } from '../../schemas/graph.schema';

interface ToolsPanelProps {
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
}

function ToolItem({ tool }: { tool: DiscoveredTool }) {
  return (
    <li className="rounded border px-2 py-1.5 text-xs">
      <span className="font-medium">{tool.name}</span>
      {tool.description !== undefined && (
        <p className="text-muted-foreground text-[10px] mt-0.5">{tool.description}</p>
      )}
    </li>
  );
}

function ServerToolGroup({ server, tools }: { server: McpServerConfig; tools: DiscoveredTool[] }) {
  const [expanded, setExpanded] = useState(true);

  if (tools.length === 0) return null;

  return (
    <div>
      <button
        className="flex w-full items-center gap-1.5 text-sm font-semibold py-1"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <ChevronDown className={`size-3 transition-transform ${expanded ? '' : '-rotate-90'}`} />
        {server.name}
        <Badge variant="outline" className="ml-auto">{String(tools.length)}</Badge>
      </button>
      {expanded && (
        <ul className="space-y-1 mt-1">
          {tools.map((tool) => (
            <ToolItem key={tool.name} tool={tool} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <p className="text-xs text-muted-foreground text-center py-8 bg-gray-100 p-2 rounded-md">
      No tools discovered yet. Configure MCP servers in the Presets panel and click &quot;Discover Tools&quot;.
    </p>
  );
}

function ToolsList({ servers, discoveredTools }: ToolsPanelProps) {
  const hasTools = servers.some((s) => (discoveredTools[s.id]?.length ?? 0) > 0);

  if (!hasTools) return <EmptyState />;

  return (
    <div className="space-y-3">
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

export function ToolsPanel({ servers, discoveredTools }: ToolsPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Wrench className="size-4" />
        <h2 className="text-sm font-semibold">MCP Tools</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <ToolsList servers={servers} discoveredTools={discoveredTools} />
      </div>
    </div>
  );
}
