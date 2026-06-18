'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslations } from 'next-intl';

export type StoreSelectSaveState = 'idle' | 'saving' | 'saved' | 'conflict' | 'error' | 'disabled-by-failure';

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

function resolveLabel(
  value: string,
  stores: StoreSelectStore[],
  placeholder: string,
  noneLabel: string
): string {
  if (value === NONE_VALUE) return placeholder;
  const match = stores.find((s) => s.id === value);
  if (match !== undefined) return match.name;
  // Bound id no longer in the list (e.g. store deleted) — show None rather than the raw id.
  return noneLabel;
}

export function StoreSelect(props: StoreSelectProps): React.JSX.Element {
  const t = useTranslations('agentTools');
  const value = props.selectedId ?? NONE_VALUE;
  const handleChange = (next: unknown): void => {
    if (typeof next !== 'string') return;
    props.onChange(next === NONE_VALUE ? null : next);
  };
  const placeholder = props.placeholder ?? t('selectStore');
  const noneLabel = t('noneOption');
  const label = resolveLabel(value, props.stores, placeholder, noneLabel);
  return (
    <Select value={value} onValueChange={handleChange} disabled={props.disabled}>
      <SelectTrigger size="sm" className={`min-w-[10rem] ${statusClass(props.saveState)}`}>
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} side="bottom">
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
