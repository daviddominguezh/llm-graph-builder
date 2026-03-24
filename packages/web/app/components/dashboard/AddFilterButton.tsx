'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import type { ActiveFilter, FilterDefinition } from './filter-bar-types';
import { FilterPopoverContent } from './filter-inputs/FilterPopoverContent';

interface AddFilterButtonProps {
  definitions: FilterDefinition[];
  activeKeys: Set<string>;
  onAdd: (filter: ActiveFilter) => void;
}

function FilterOptionsList({
  available,
  onSelect,
}: {
  available: FilterDefinition[];
  onSelect: (def: FilterDefinition) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {available.map((def) => (
        <button
          key={def.key}
          type="button"
          className="cursor-pointer rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          onClick={() => onSelect(def)}
        >
          {def.label}
        </button>
      ))}
    </div>
  );
}

export function AddFilterButton({ definitions, activeKeys, onAdd }: AddFilterButtonProps) {
  const t = useTranslations('dashboard.filters');
  const [open, setOpen] = useState(false);
  const [selectedDef, setSelectedDef] = useState<FilterDefinition | null>(null);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setSelectedDef(null);
  }, []);

  const handleSelect = useCallback((def: FilterDefinition) => {
    setSelectedDef(def);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedDef(null);
  }, []);

  const handleApply = useCallback(
    (filter: ActiveFilter) => {
      onAdd(filter);
      setOpen(false);
      setSelectedDef(null);
    },
    [onAdd]
  );

  const available = definitions.filter((d) => !activeKeys.has(d.key));

  if (available.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <Plus className="size-3" />
        {t('addFilter')}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 gap-0 p-0">
        {selectedDef === null ? (
          <div className="p-1.5">
            <FilterOptionsList available={available} onSelect={handleSelect} />
          </div>
        ) : (
          <>
            <PopoverHeader className="flex flex-row items-center gap-1.5 border-b px-2 py-1.5">
              <Button variant="ghost" size="icon-xs" onClick={handleBack} aria-label={t('back')}>
                <ArrowLeft className="size-3" />
              </Button>
              <PopoverTitle className="text-xs font-medium">{selectedDef.label}</PopoverTitle>
            </PopoverHeader>
            <div className="p-2">
              <FilterPopoverContent definition={selectedDef} onApply={handleApply} />
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
