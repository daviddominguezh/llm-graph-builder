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

import { useToolRegistry } from '../ToolRegistryProvider';

interface ToolGroupItem {
  value: string;
  items: string[];
}

interface ToolComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

function buildGroupItems(groups: ReadonlyArray<{ groupName: string; tools: ReadonlyArray<{ name: string }> }>): ToolGroupItem[] {
  return groups.map((g) => ({
    value: g.groupName,
    items: g.tools.map((t) => t.name),
  }));
}

export function ToolCombobox({ value, onValueChange, placeholder }: ToolComboboxProps) {
  const { groups } = useToolRegistry();
  const groupItems = useMemo(() => buildGroupItems(groups), [groups]);

  return (
    <Combobox items={groupItems} value={value} onValueChange={(v) => onValueChange(v ?? '')}>
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
