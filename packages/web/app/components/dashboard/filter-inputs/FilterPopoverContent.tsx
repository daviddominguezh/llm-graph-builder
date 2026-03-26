'use client';

import type { ActiveFilter, FilterDefinition } from '../filterBarTypes';

import { DateRangeInput } from './DateRangeInput';
import { SelectFilterInput } from './SelectFilterInput';
import { TextFilterInput } from './TextFilterInput';

interface FilterPopoverContentProps {
  definition: FilterDefinition;
  onApply: (filter: ActiveFilter) => void;
}

export function FilterPopoverContent({ definition, onApply }: FilterPopoverContentProps) {
  if (definition.type === 'dateRange') {
    return <DateRangeInput definition={definition} onApply={onApply} />;
  }
  if (definition.type === 'select') {
    return <SelectFilterInput definition={definition} onApply={onApply} />;
  }
  return <TextFilterInput definition={definition} onApply={onApply} />;
}
