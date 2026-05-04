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
import type { SelectedTool } from '@daviddh/llm-graph-runner';
import { useMemo } from 'react';

import type { RegistryTool } from '../../lib/toolRegistryTypes';
import { useToolRegistry } from '../ToolRegistryProvider';

interface ToolComboboxProps {
  /** Selected tool ref or null for unselected. */
  value: SelectedTool | null;
  onValueChange: (value: SelectedTool | null) => void;
  placeholder?: string;
}

interface ToolGroupItem {
  value: string;
  items: string[];
}

/**
 * Derives providerType and providerId from a RegistryTool's sourceId.
 * Built-in tools have sourceId in the form `__<providerId>__`.
 * MCP tools use the raw uuid as sourceId.
 */
function deriveProvider(sourceId: string): { providerType: 'builtin' | 'mcp'; providerId: string } {
  const builtinMatch = /^__(.+)__$/.exec(sourceId);
  if (builtinMatch) {
    return { providerType: 'builtin', providerId: builtinMatch[1] ?? '' };
  }
  return { providerType: 'mcp', providerId: sourceId };
}

function toItemValue(ref: SelectedTool): string {
  return `${ref.providerType}:${ref.providerId}:${ref.toolName}`;
}

function fromItemValue(itemValue: string): SelectedTool | null {
  const colonIdx = itemValue.indexOf(':');
  if (colonIdx === -1) return null;
  const providerType = itemValue.slice(0, colonIdx);
  if (providerType !== 'builtin' && providerType !== 'mcp') return null;
  const rest = itemValue.slice(colonIdx + 1);
  const secondColon = rest.indexOf(':');
  if (secondColon === -1) return null;
  return {
    providerType,
    providerId: rest.slice(0, secondColon),
    toolName: rest.slice(secondColon + 1),
  };
}

function buildGroupItems(tools: ReadonlyArray<RegistryTool>): ToolGroupItem[] {
  const groupMap = new Map<string, string[]>();
  for (const tool of tools) {
    const { providerType, providerId } = deriveProvider(tool.sourceId);
    const itemValue = toItemValue({ providerType, providerId, toolName: tool.name });
    const existing = groupMap.get(tool.group);
    if (existing) {
      existing.push(itemValue);
    } else {
      groupMap.set(tool.group, [itemValue]);
    }
  }
  return Array.from(groupMap.entries()).map(([groupName, items]) => ({
    value: groupName,
    items,
  }));
}

export function ToolCombobox({ value, onValueChange, placeholder }: ToolComboboxProps) {
  const { tools } = useToolRegistry();
  const groupItems = useMemo(() => buildGroupItems(tools), [tools]);
  const itemValue = value !== null ? toItemValue(value) : '';

  const handleValueChange = (v: string | null) => {
    if (!v) {
      onValueChange(null);
      return;
    }
    onValueChange(fromItemValue(v));
  };

  return (
    <Combobox items={groupItems} value={itemValue} onValueChange={handleValueChange}>
      <ComboboxInput placeholder={placeholder ?? 'Select tool...'} className="h-8 text-xs" />
      <ComboboxContent>
        <ComboboxEmpty>No tools found</ComboboxEmpty>
        <ComboboxList>
          {(group) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(item) => {
                  const ref = fromItemValue(item);
                  const label = ref?.toolName ?? item;
                  return (
                    <ComboboxItem key={item} value={item}>
                      {label}
                    </ComboboxItem>
                  );
                }}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
