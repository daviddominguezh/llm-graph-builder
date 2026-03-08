'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, SquareFunction } from 'lucide-react';

import { Input } from '@/components/ui/input';
import type { DiscoveredTool } from '../../lib/api';
import type { McpServerConfig } from '../../schemas/graph.schema';

interface ToolsPanelProps {
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
  open: boolean;
  onClose: () => void;
}

interface FlatTool {
  serverName: string;
  name: string;
  description: string | undefined;
}

function flattenTools(servers: McpServerConfig[], discovered: Record<string, DiscoveredTool[]>): FlatTool[] {
  const result: FlatTool[] = [];
  for (const server of servers) {
    for (const tool of discovered[server.id] ?? []) {
      result.push({ serverName: server.name, name: tool.name, description: tool.description });
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

function ToolRow({ tool, active, onMouseEnter }: {
  tool: FlatTool;
  active: boolean;
  onMouseEnter: () => void;
}) {
  return (
    <li>
      <div
        className={`flex w-full flex-col rounded-md px-3 py-1.5 text-left text-xs ${
          active ? 'bg-accent/10' : 'hover:bg-accent/5'
        }`}
        onMouseEnter={onMouseEnter}
      >
        <span className="font-medium">{tool.name}</span>
        <span className="text-[10px] text-muted-foreground truncate">
          {tool.description ?? tool.serverName}
        </span>
      </div>
    </li>
  );
}

export function ToolsPanel({ servers, discoveredTools, open, onClose }: ToolsPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevOpen, setPrevOpen] = useState(false);

  if (open && !prevOpen) {
    setPrevOpen(true);
    setQuery('');
    setActiveIndex(0);
  }
  if (!open && prevOpen) {
    setPrevOpen(false);
  }

  const allTools = useMemo(() => flattenTools(servers, discoveredTools), [servers, discoveredTools]);
  const results = filterTools(allTools, query);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

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

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="absolute top-16 left-1/2 z-20 -translate-x-1/2 w-[28rem] h-80 flex flex-col rounded-lg border bg-background shadow-lg"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <Search className="size-3.5 text-muted-foreground shrink-0" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
          onKeyDown={handleKeyDown}
          placeholder="Search tools..."
          className="h-7 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
        />
        <SquareFunction className="size-3.5 text-muted-foreground shrink-0" />
      </div>
      <ul className="flex-1 overflow-y-auto p-1">
        {results.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">
            {allTools.length === 0 ? 'No tools discovered yet' : 'No results'}
          </li>
        ) : (
          results.map((tool, i) => (
            <ToolRow
              key={`${tool.serverName}-${tool.name}`}
              tool={tool}
              active={i === activeIndex}
              onMouseEnter={() => setActiveIndex(i)}
            />
          ))
        )}
      </ul>
    </div>
  );
}
