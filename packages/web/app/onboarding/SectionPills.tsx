'use client';

import { OptionPill } from '@/components/ui/option-pill';

interface SingleSelectSectionProps<T extends string> {
  label: string;
  options: readonly T[];
  selected: T | null;
  getLabel: (v: T) => string;
  onSelect: (v: T) => void;
}

export function SingleSelectSection<T extends string>({
  label,
  options,
  selected,
  getLabel,
  onSelect,
}: SingleSelectSectionProps<T>) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground/80">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <OptionPill
            key={opt}
            label={getLabel(opt)}
            checked={selected === opt}
            onToggle={() => onSelect(opt)}
          />
        ))}
      </div>
    </div>
  );
}

interface MultiSelectSectionProps<T extends string> {
  label: string;
  options: readonly T[];
  selected: T[];
  getLabel: (v: T) => string;
  onToggle: (v: T) => void;
}

export function MultiSelectSection<T extends string>({
  label,
  options,
  selected,
  getLabel,
  onToggle,
}: MultiSelectSectionProps<T>) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground/80">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <OptionPill
            key={opt}
            label={getLabel(opt)}
            checked={selected.includes(opt)}
            onToggle={() => onToggle(opt)}
          />
        ))}
      </div>
    </div>
  );
}
