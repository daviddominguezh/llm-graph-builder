'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { ActiveFilter, FilterDefinition } from './filter-bar-types';
import { FilterPopoverContent } from './filter-inputs/FilterPopoverContent';

interface AddFilterButtonProps {
  definitions: FilterDefinition[];
  activeKeys: Set<string>;
  onAdd: (filter: ActiveFilter) => void;
}

export function AddFilterButton({ definitions, activeKeys, onAdd }: AddFilterButtonProps) {
  const t = useTranslations('dashboard.filters');
  const [selectedDef, setSelectedDef] = useState<FilterDefinition | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const available = definitions.filter((d) => !activeKeys.has(d.key));

  const handleSelect = (def: FilterDefinition) => {
    setSelectedDef(def);
    setPopoverOpen(true);
  };

  const handleApply = (filter: ActiveFilter) => {
    onAdd(filter);
    setPopoverOpen(false);
    setSelectedDef(null);
  };

  if (available.length === 0) return null;

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <DropdownMenu>
        <PopoverTrigger
          render={<DropdownMenuTrigger render={<Button variant="outline" size="xs" />} />}
        >
          <Plus className="size-3" />
          {t('addFilter')}
        </PopoverTrigger>
        <DropdownMenuContent>
          {available.map((def) => (
            <DropdownMenuItem key={def.key} onClick={() => handleSelect(def)}>
              {def.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <PopoverContent>
        {selectedDef !== null && <FilterPopoverContent definition={selectedDef} onApply={handleApply} />}
      </PopoverContent>
    </Popover>
  );
}
