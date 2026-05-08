'use client';

import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { RegistryState } from '../../hooks/useAgentRegistry';
import type { RegistryTool, ToolGroup } from '../../lib/toolRegistry';
import { PanelLoadingState } from './PanelLoadingState';
import { PanelTotalFailureState } from './PanelTotalFailureState';
import { SaveStateIndicator } from './SaveStateIndicator';
import { type AgentModeProps, AgentModeBody } from './ToolsPanelAgentMode';
import { ToolsList } from './ToolsPanelViewMode';

interface SearchRowProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (q: string) => void;
  placeholder: string;
  agent?: AgentModeProps;
}

export function SearchRow({
  inputRef,
  query,
  onQueryChange,
  placeholder,
  agent,
}: SearchRowProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b">
      <Search className="size-3.5 text-muted-foreground shrink-0" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder}
        className="h-7 border-0 bg-transparent! p-0 text-xs shadow-none focus-visible:ring-0"
      />
      {agent !== undefined && (
        <SaveStateIndicator state={agent.saveState} onRetry={agent.onRetrySave} />
      )}
    </div>
  );
}

interface ToolsTabBodyProps {
  registryState: RegistryState;
  filteredGroups: ToolGroup[];
  totalCount: number;
  expandedTool: string | null;
  query: string;
  agent?: AgentModeProps;
  onToggleTool: (key: string) => void;
  onCollapseTool: () => void;
  onTestTool: (tool: RegistryTool) => void;
}

function getFailedProviders(registryState: RegistryState): string[] {
  return registryState.kind === 'partial-failure' ? registryState.failedProviders : [];
}

export function ToolsTabBody(props: ToolsTabBodyProps): React.JSX.Element {
  const { registryState, filteredGroups, totalCount, expandedTool, query, agent } = props;
  if (registryState.kind === 'loading') return <PanelLoadingState />;
  if (registryState.kind === 'total-failure') {
    return <PanelTotalFailureState reason={registryState.reason} />;
  }
  const failedProviders = getFailedProviders(registryState);
  if (agent !== undefined) {
    return (
      <AgentModeBody
        agent={agent}
        groups={filteredGroups}
        searchActive={query !== ''}
        expandedTool={expandedTool}
        failedProviders={failedProviders}
        onToggleTool={props.onToggleTool}
        onCollapseTool={props.onCollapseTool}
      />
    );
  }
  return (
    <ToolsList
      groups={filteredGroups}
      totalCount={totalCount}
      expandedTool={expandedTool}
      failedProviders={failedProviders}
      onToggleTool={props.onToggleTool}
      onCollapseTool={props.onCollapseTool}
      onTestTool={props.onTestTool}
    />
  );
}

export interface ToolsPanelState {
  query: string;
  setQuery: (q: string) => void;
  activeTab: string;
  setActiveTab: (s: string) => void;
  expandedTool: string | null;
  setExpandedTool: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useToolsPanelState(open: boolean): ToolsPanelState {
  const [query, setQuery] = useState('');
  const [prevOpen, setPrevOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('tools');
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  if (open && !prevOpen) {
    setPrevOpen(true);
    setQuery('');
    setActiveTab('tools');
    setExpandedTool(null);
  }
  if (!open && prevOpen) setPrevOpen(false);
  return { query, setQuery, activeTab, setActiveTab, expandedTool, setExpandedTool };
}

export function useOutsideClose(
  open: boolean,
  containerRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void
): void {
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent): void => {
      const el = e.target as HTMLElement;
      const inside = containerRef.current?.contains(el) === true;
      const inPortal = el.closest('[data-tools-panel-portal]') !== null;
      if (!inside && !inPortal) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, containerRef]);
}
