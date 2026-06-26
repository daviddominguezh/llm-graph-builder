'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { ReactElement } from 'react';

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';

export interface AgentOption {
  id: string;
  name: string;
  slug: string;
}

interface AgentFilterComboboxProps {
  agents: AgentOption[];
  value: string | null;
  onChange: (agentId: string | null) => void;
  className?: string;
}

const ALL_AGENTS_VALUE = '__all__';

function buildItems(agents: AgentOption[], allLabel: string): AgentOption[] {
  return [{ id: ALL_AGENTS_VALUE, name: allLabel, slug: '' }, ...agents];
}

function toAgentId(value: string | undefined): string | null {
  if (!value || value === ALL_AGENTS_VALUE) return null;
  return value;
}

export function AgentFilterCombobox({
  agents,
  value,
  onChange,
  className,
}: AgentFilterComboboxProps): ReactElement {
  const t = useTranslations('forms.chatList.agentFilter');
  const allLabel = t('placeholder');
  const items = useMemo(() => buildItems(agents, allLabel), [agents, allLabel]);
  const itemIds = useMemo(() => items.map((a) => a.id), [items]);
  const labelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of items) map.set(a.id, a.name);
    return map;
  }, [items]);

  const selectedValue = value ?? ALL_AGENTS_VALUE;

  return (
    <Combobox
      items={itemIds}
      value={selectedValue}
      onValueChange={(v: string | null): void => onChange(toAgentId(v ?? undefined))}
      itemToStringLabel={(id: string): string => labelById.get(id) ?? id}
    >
      <ComboboxInput
        placeholder={t('search.placeholder')}
        className={className}
      />
      <ComboboxContent>
        <ComboboxEmpty>{allLabel}</ComboboxEmpty>
        <ComboboxList>
          {(id: string) => (
            <ComboboxItem key={id} value={id}>
              {labelById.get(id) ?? id}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
