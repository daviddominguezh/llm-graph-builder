'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type StoreSelectSaveState =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'conflict'
  | 'error'
  | 'disabled-by-failure';

export interface StoreSelectStore {
  id: string;
  name: string;
}

export interface StoreSelectProps {
  stores: StoreSelectStore[];
  selectedId: string | null;
  saveState: StoreSelectSaveState;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

// Base UI Select uses string values; "" stands for the None option so the
// trigger can render `placeholder` when nothing is bound.
const NONE_VALUE = '';

function statusClass(saveState: StoreSelectSaveState): string {
  if (saveState === 'saving') return 'opacity-80';
  if (saveState === 'conflict' || saveState === 'error') return 'ring-1 ring-destructive/40';
  return '';
}

export function StoreSelect(props: StoreSelectProps): React.JSX.Element {
  const value = props.selectedId ?? NONE_VALUE;
  const handleChange = (next: unknown): void => {
    if (typeof next !== 'string') return;
    props.onChange(next === NONE_VALUE ? null : next);
  };
  /* i18n: storeSelectPlaceholder */
  const placeholder = props.placeholder ?? 'Select store';
  /* i18n: storeSelectNoneLabel */
  const noneLabel = '— None —';
  return (
    <Select value={value} onValueChange={handleChange} disabled={props.disabled}>
      <SelectTrigger size="sm" className={`min-w-[10rem] ${statusClass(props.saveState)}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>{noneLabel}</SelectItem>
        {props.stores.map((store) => (
          <SelectItem key={store.id} value={store.id}>
            {store.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
