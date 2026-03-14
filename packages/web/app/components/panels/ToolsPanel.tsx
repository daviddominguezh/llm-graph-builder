'use client';

import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, SquareFunction } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { McpServerStatus } from '../../hooks/useMcpServers';
import type { DiscoveredTool } from '../../lib/api';
import type { McpServerConfig } from '../../schemas/graph.schema';
import { McpServersSection } from './McpServersSection';

interface McpProps {
  servers: McpServerConfig[];
  discovering: Record<string, boolean>;
  serverStatus: Record<string, McpServerStatus>;
  orgId: string;
  onAddServer: () => void;
  onRemoveServer: (id: string) => void;
  onUpdateServer: (id: string, updates: Partial<McpServerConfig>) => void;
  onDiscoverTools: (id: string) => void;
  onPublishServer: (server: McpServerConfig) => void;
  onOpenLibrary: () => void;
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

interface ToolGroup {
  serverName: string;
  tools: FlatTool[];
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

function buildToolGroups(
  servers: McpServerConfig[],
  discovered: Record<string, DiscoveredTool[]>
): ToolGroup[] {
  const groups: ToolGroup[] = [];
  for (const server of servers) {
    const serverTools = (discovered[server.id] ?? []).map((tool) => ({
      serverName: server.name,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
    if (serverTools.length > 0) {
      serverTools.sort((a, b) => a.name.localeCompare(b.name));
      groups.push({ serverName: server.name, tools: serverTools });
    }
  }
  groups.sort((a, b) => a.serverName.localeCompare(b.serverName));
  return groups;
}

function filterGroups(groups: ToolGroup[], query: string): ToolGroup[] {
  if (query === '') return groups;
  const lower = query.toLowerCase();
  const filtered: ToolGroup[] = [];
  for (const group of groups) {
    const tools = group.tools.filter(
      (t) => t.name.toLowerCase().includes(lower) || t.description?.toLowerCase().includes(lower)
    );
    if (tools.length > 0) {
      filtered.push({ serverName: group.serverName, tools });
    }
  }
  return filtered;
}

function countTools(groups: ToolGroup[]): number {
  let count = 0;
  for (const g of groups) count += g.tools.length;
  return count;
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

function SchemaFieldRow({
  name,
  prop,
  isRequired,
}: {
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
            <span key={v} className="rounded bg-muted px-1 py-0.5 font-mono text-[9px]">
              {v}
            </span>
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
  const cmp = (a: [string, SchemaProperty], b: [string, SchemaProperty]) => a[0].localeCompare(b[0]);
  const required = entries.filter(([n]) => requiredSet.has(n)).sort(cmp);
  const optional = entries.filter(([n]) => !requiredSet.has(n)).sort(cmp);
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

function FloatingSchema({
  anchorRef,
  schema,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  schema: ToolSchema;
}) {
  const positionRef = useCallback(
    (el: HTMLDivElement | null) => {
      const anchor = anchorRef.current;
      if (!el || !anchor) return;
      const rect = anchor.getBoundingClientRect();
      el.style.top = `${String(rect.bottom + 4)}px`;
      el.style.left = `${String(rect.left)}px`;
      el.style.width = `${String(rect.width)}px`;
    },
    [anchorRef]
  );

  return createPortal(
    <div
      ref={positionRef}
      data-tools-panel-portal
      className="fixed z-50 max-h-64 overflow-y-auto rounded-md border bg-background shadow-lg py-1.5"
    >
      <ToolSchemaDetails schema={schema} />
    </div>,
    document.body
  );
}

function ToolRow({ tool, expanded, onClick }: { tool: FlatTool; expanded: boolean; onClick: () => void }) {
  const rowRef = useRef<HTMLDivElement>(null);

  return (
    <li>
      <div
        ref={rowRef}
        className="flex w-full flex-col px-1 py-0 text-left text-xs cursor-pointer border-l-2 border-background hover:border-accent"
        onClick={onClick}
      >
        <span className="font-medium">{tool.name}</span>
        <span className="text-[10px] text-muted-foreground truncate">
          {tool.description ?? tool.serverName}
        </span>
      </div>
      {expanded && tool.inputSchema && (
        <FloatingSchema anchorRef={rowRef} schema={tool.inputSchema as ToolSchema} />
      )}
    </li>
  );
}

function ServerGroupHeader({ name }: { name: string }) {
  return (
    <div className="sticky top-0 z-10 bg-background px-2 pt-0 pb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
      <div className="pt-2">{name}</div>
    </div>
  );
}

function ToolsList({
  groups,
  totalCount,
  expandedTool,
  onToggleTool,
}: {
  groups: ToolGroup[];
  totalCount: number;
  expandedTool: string | null;
  onToggleTool: (toolKey: string) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-1 pt-0">
      {totalCount === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {groups.length === 0 ? 'No tools discovered yet' : 'No results'}
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.serverName}>
            <ServerGroupHeader name={group.serverName} />
            <ul className="flex flex-col gap-2">
              {group.tools.map((tool) => {
                const key = `${tool.serverName}-${tool.name}`;
                return (
                  <ToolRow
                    key={key}
                    tool={tool}
                    expanded={expandedTool === key}
                    onClick={() => onToggleTool(key)}
                  />
                );
              })}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

function McpTab({ mcp }: { mcp: McpProps }) {
  return (
    <div className="flex-1 overflow-y-auto p-2 pt-0 px-2">
      <McpServersSection
        servers={mcp.servers}
        discovering={mcp.discovering}
        serverStatus={mcp.serverStatus}
        orgId={mcp.orgId}
        onAdd={mcp.onAddServer}
        onRemove={mcp.onRemoveServer}
        onUpdate={mcp.onUpdateServer}
        onDiscover={mcp.onDiscoverTools}
        onPublish={mcp.onPublishServer}
        onOpenLibrary={mcp.onOpenLibrary}
      />
    </div>
  );
}

export function ToolsPanel({ servers, discoveredTools, mcp, open, onClose }: ToolsPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [prevOpen, setPrevOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('mcp');
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const t = useTranslations('toolbar');

  if (open && !prevOpen) {
    setPrevOpen(true);
    setQuery('');
    setActiveTab('mcp');
    setExpandedTool(null);
  }
  if (!open && prevOpen) {
    setPrevOpen(false);
  }

  const allGroups = useMemo(() => buildToolGroups(servers, discoveredTools), [servers, discoveredTools]);
  const filteredGroups = filterGroups(allGroups, query);
  const totalCount = countTools(filteredGroups);

  useEffect(() => {
    if (open && activeTab === 'tools') {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, activeTab]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const insideContainer = containerRef.current?.contains(target) === true;
      const insidePortal = target.closest('[data-tools-panel-portal]') !== null;
      if (!insideContainer && !insidePortal) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
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
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tools..."
              className="h-7 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
            />
            <SquareFunction className="size-3.5 text-muted-foreground shrink-0" />
          </div>
          <ToolsList
            groups={filteredGroups}
            totalCount={totalCount}
            expandedTool={expandedTool}
            onToggleTool={handleToggleTool}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
