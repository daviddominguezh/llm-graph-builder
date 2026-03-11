'use client';

import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from '@/components/ui/combobox';
import { useMemo } from 'react';
import type { DiscoveredTool } from '../../lib/api';
import type { McpServerConfig } from '../../schemas/graph.schema';

interface ToolGroupItem {
  value: string;
  items: string[];
}

function buildGroups(servers: McpServerConfig[], discovered: Record<string, DiscoveredTool[]>): ToolGroupItem[] {
  const groups: ToolGroupItem[] = [];
  for (const server of servers) {
    const tools = (discovered[server.id] ?? []).map((t) => t.name).sort((a, b) => a.localeCompare(b));
    if (tools.length > 0) {
      groups.push({ value: server.name, items: tools });
    }
  }
  groups.sort((a, b) => a.value.localeCompare(b.value));
  return groups;
}

interface ToolComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
  placeholder?: string;
}

export function ToolCombobox({ value, onValueChange, servers, discoveredTools, placeholder }: ToolComboboxProps) {
  const groups = useMemo(() => buildGroups(servers, discoveredTools), [servers, discoveredTools]);

  return (
    <Combobox items={groups} value={value} onValueChange={(v) => onValueChange(v ?? '')}>
      <ComboboxInput placeholder={placeholder ?? 'Select tool...'} className="h-8 text-xs" />
      <ComboboxContent>
        <ComboboxEmpty>No tools found</ComboboxEmpty>
        <ComboboxList>
          {(group) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(item) => (
                  <ComboboxItem key={item} value={item}>
                    {item}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
