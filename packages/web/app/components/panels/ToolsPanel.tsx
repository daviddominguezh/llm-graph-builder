'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search, SquareFunction } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DiscoveredTool } from '../../lib/api';
import type { McpServerConfig } from '../../schemas/graph.schema';
import type { McpServerStatus } from '../../hooks/useMcpServers';
import { McpServersSection } from './McpServersSection';

interface McpProps {
  servers: McpServerConfig[];
  discovering: Record<string, boolean>;
  serverStatus: Record<string, McpServerStatus>;
  onAddServer: () => void;
  onRemoveServer: (id: string) => void;
  onUpdateServer: (id: string, updates: Partial<McpServerConfig>) => void;
  onDiscoverTools: (id: string) => void;
}

interface ToolsPanelProps {
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
  mcp: McpProps;
  open: boolean;
  onClose: () => void;
}

interface FlatTool {
  serverName: string;
  name: string;
  description: string | undefined;
  inputSchema: Record<string, unknown> | undefined;
}

interface SchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  required?: boolean;
}

interface ToolSchema {
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

function flattenTools(servers: McpServerConfig[], discovered: Record<string, DiscoveredTool[]>): FlatTool[] {
  const result: FlatTool[] = [];
  for (const server of servers) {
    for (const tool of discovered[server.id] ?? []) {
      result.push({
        serverName: server.name,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      });
    }
  }
  return result;
}

function filterTools(tools: FlatTool[], query: string): FlatTool[] {
  if (query === '') return tools;
  const lower = query.toLowerCase();
  return tools.filter(
    (t) => t.name.toLowerCase().includes(lower) || t.description?.toLowerCase().includes(lower)
  );
}

function buildRequiredSet(schema: ToolSchema): Set<string> {
  const required = new Set<string>();
  if (Array.isArray(schema.required)) {
    for (const name of schema.required) required.add(name);
  }
  if (schema.properties) {
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (prop.required === true) required.add(name);
    }
  }
  return required;
}

function SchemaFieldRow({ name, prop, isRequired }: {
  name: string;
  prop: SchemaProperty;
  isRequired: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex min-w-0 items-baseline gap-1">
        <code className="shrink-0 font-mono text-[11px] font-semibold">{name}</code>
        {prop.type && <span className="text-[10px] text-muted-foreground">({prop.type})</span>}
        {isRequired && <span className="text-[10px] font-medium text-orange-600">*</span>}
      </div>
      {prop.description && (
        <span className="text-[10px] leading-tight text-muted-foreground">{prop.description}</span>
      )}
      {prop.enum && prop.enum.length > 0 && (
        <div className="flex flex-wrap gap-0.5">
          {prop.enum.map((v) => (
            <span key={v} className="rounded bg-muted px-1 py-0.5 font-mono text-[9px]">{v}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolSchemaDetails({ schema }: { schema: ToolSchema }) {
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    return <p className="px-3 py-1 text-[10px] text-muted-foreground">No parameters</p>;
  }

  const requiredSet = buildRequiredSet(schema);
  const entries = Object.entries(schema.properties);
  const required = entries.filter(([n]) => requiredSet.has(n));
  const optional = entries.filter(([n]) => !requiredSet.has(n));
  const sorted = [...required, ...optional];

  return (
    <div className="flex flex-col px-3 pb-2">
      {sorted.map(([name, prop], index) => (
        <div key={name}>
          {index > 0 && <Separator className="my-1.5" />}
          <SchemaFieldRow name={name} prop={prop} isRequired={requiredSet.has(name)} />
        </div>
      ))}
    </div>
  );
}

function ToolRow({ tool, active, expanded, onMouseEnter, onClick }: {
  tool: FlatTool;
  active: boolean;
  expanded: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  return (
    <li className="relative">
      <div
        className={`flex w-full flex-col rounded-md px-3 py-1.5 text-left text-xs cursor-pointer ${
          active ? 'bg-accent/10' : 'hover:bg-accent/5'
        }`}
        onMouseEnter={onMouseEnter}
        onClick={onClick}
      >
        <span className="font-medium">{tool.name}</span>
        <span className="text-[10px] text-muted-foreground truncate">
          {tool.description ?? tool.serverName}
        </span>
      </div>
      {expanded && tool.inputSchema && (
        <div className="absolute left-1 right-1 z-30 rounded-md border bg-background shadow-md py-1.5">
          <ToolSchemaDetails schema={tool.inputSchema as ToolSchema} />
        </div>
      )}
    </li>
  );
}

function ToolsList({ results, allTools, activeIndex, expandedTool, onSetActiveIndex, onToggleTool }: {
  results: FlatTool[];
  allTools: FlatTool[];
  activeIndex: number;
  expandedTool: string | null;
  onSetActiveIndex: (i: number) => void;
  onToggleTool: (toolKey: string) => void;
}) {
  return (
    <ul className="flex-1 overflow-y-auto p-1">
      {results.length === 0 ? (
        <li className="px-3 py-2 text-xs text-muted-foreground">
          {allTools.length === 0 ? 'No tools discovered yet' : 'No results'}
        </li>
      ) : (
        results.map((tool, i) => {
          const key = `${tool.serverName}-${tool.name}`;
          return (
            <ToolRow
              key={key}
              tool={tool}
              active={i === activeIndex}
              expanded={expandedTool === key}
              onMouseEnter={() => onSetActiveIndex(i)}
              onClick={() => onToggleTool(key)}
            />
          );
        })
      )}
    </ul>
  );
}

function McpTab({ mcp }: { mcp: McpProps }) {
  return (
    <div className="flex-1 overflow-y-auto p-2 pt-0 px-2">
      <McpServersSection
        servers={mcp.servers}
        discovering={mcp.discovering}
        serverStatus={mcp.serverStatus}
        onAdd={mcp.onAddServer}
        onRemove={mcp.onRemoveServer}
        onUpdate={mcp.onUpdateServer}
        onDiscover={mcp.onDiscoverTools}
      />
    </div>
  );
}

export function ToolsPanel({ servers, discoveredTools, mcp, open, onClose }: ToolsPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevOpen, setPrevOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('mcp');
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const t = useTranslations('toolbar');

  if (open && !prevOpen) {
    setPrevOpen(true);
    setQuery('');
    setActiveIndex(0);
    setActiveTab('mcp');
    setExpandedTool(null);
  }
  if (!open && prevOpen) {
    setPrevOpen(false);
  }

  const allTools = useMemo(() => flattenTools(servers, discoveredTools), [servers, discoveredTools]);
  const results = filterTools(allTools, query);

  useEffect(() => {
    if (open && activeTab === 'tools') {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, activeTab]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (activeTab !== 'tools') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    }
  };

  const handleToggleTool = (key: string) => {
    setExpandedTool((prev) => (prev === key ? null : key));
  };

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="absolute top-16 left-1/2 z-20 -translate-x-1/2 w-[28rem] h-96 flex flex-col rounded-lg border bg-background shadow-lg"
      onKeyDown={handleKeyDown}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full gap-0">
        <div className="flex items-center gap-0 p-1 border-b">
          <TabsList className="w-full">
            <TabsTrigger value="mcp">{t('mcpServersTab')}</TabsTrigger>
            <TabsTrigger value="tools">{t('toolsTab')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="mcp" className="flex-1 overflow-y-auto mt-0 pt-0 px-0">
          <McpTab mcp={mcp} />
        </TabsContent>
        <TabsContent value="tools" className="flex-1 overflow-y-auto flex flex-col mt-0 pt-0">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
              placeholder="Search tools..."
              className="h-7 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
            />
            <SquareFunction className="size-3.5 text-muted-foreground shrink-0" />
          </div>
          <ToolsList
            results={results}
            allTools={allTools}
            activeIndex={activeIndex}
            expandedTool={expandedTool}
            onSetActiveIndex={setActiveIndex}
            onToggleTool={handleToggleTool}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
