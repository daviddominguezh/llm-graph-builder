'use client';

import { useMemo } from 'react';

import { ActiveFilterChips } from './ActiveFilterChips';
import { AddFilterButton } from './AddFilterButton';
import type { FilterBarProps } from './filter-bar-types';

export type { ActiveFilter, FilterBarProps, FilterDefinition } from './filter-bar-types';

export function FilterBar({ definitions, active, onAdd, onRemove, onClear }: FilterBarProps) {
  const activeKeys = useMemo(() => new Set(active.map((f) => f.key)), [active]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActiveFilterChips filters={active} onRemove={onRemove} onClear={onClear} />
      <AddFilterButton definitions={definitions} activeKeys={activeKeys} onAdd={onAdd} />
    </div>
  );
}
