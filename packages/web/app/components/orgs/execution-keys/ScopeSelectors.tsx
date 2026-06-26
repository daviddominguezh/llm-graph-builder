'use client';

import { Checkbox } from '@/components/ui/checkbox';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface ScopeOption {
  value: string;
  label: string;
}

function ChipsList({ selected }: { selected: ScopeOption[] }) {
  return (
    <>
      {selected.map((item) => (
        <ComboboxChip key={item.value}>{item.label}</ComboboxChip>
      ))}
    </>
  );
}

interface ScopeMultiSelectProps {
  id: string;
  label: string;
  description: string;
  placeholder: string;
  options: ScopeOption[];
  selected: ScopeOption[];
  onSelectedChange: (values: ScopeOption[]) => void;
  error: string;
}

export function ScopeMultiSelect({
  id,
  label,
  description,
  placeholder,
  options,
  selected,
  onSelectedChange,
  error,
}: ScopeMultiSelectProps) {
  const anchor = useComboboxAnchor();

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-muted-foreground text-xs">{description}</p>
      <Combobox
        multiple
        items={options}
        value={selected}
        onValueChange={onSelectedChange}
        itemToStringLabel={(item) => item.label}
        isItemEqualToValue={(a, b) => a.value === b.value}
      >
        <ComboboxChips ref={anchor}>
          <ChipsList selected={selected} />
          <ComboboxChipsInput id={id} placeholder={placeholder} />
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>{placeholder}</ComboboxEmpty>
          <ComboboxList>
            {(item: ScopeOption) => (
              <ComboboxItem key={item.value} value={item}>
                {item.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {error !== '' && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

function ScopeWarning({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <TriangleAlert className="size-3.5 shrink-0 mt-0.5" />
      <p>{message}</p>
    </div>
  );
}

interface ScopeToggleProps {
  id: string;
  label: string;
  description: string;
  warning: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function ScopeToggle({
  id,
  label,
  description,
  warning,
  checked,
  onCheckedChange,
}: ScopeToggleProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Checkbox id={id} checked={checked} onCheckedChange={(val) => onCheckedChange(val === true)} />
        <Label htmlFor={id}>{label}</Label>
      </div>
      <p className="text-muted-foreground text-xs">{description}</p>
      {checked && <ScopeWarning message={warning} />}
    </div>
  );
}

interface AllAgentsToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function AllAgentsToggle({ checked, onCheckedChange }: AllAgentsToggleProps) {
  const t = useTranslations('executionKeys');
  return (
    <ScopeToggle
      id="exec-key-all-agents"
      label={t('allAgents')}
      description={t('allAgentsDescription')}
      warning={t('allAgentsWarning')}
      checked={checked}
      onCheckedChange={onCheckedChange}
    />
  );
}

export function AllTenantsToggle({ checked, onCheckedChange }: AllAgentsToggleProps) {
  const t = useTranslations('executionKeys');
  return (
    <ScopeToggle
      id="exec-key-all-tenants"
      label={t('allTenants')}
      description={t('allTenantsDescription')}
      warning={t('allTenantsWarning')}
      checked={checked}
      onCheckedChange={onCheckedChange}
    />
  );
}
