'use client';

import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

export type ThinkingEffort = 'low' | 'medium' | 'high';

interface SimulationThinkingEffortProps {
  value: ThinkingEffort;
  onValueChange: (value: ThinkingEffort) => void;
}

const EFFORT_OPTIONS: ThinkingEffort[] = ['low', 'medium', 'high'];

const EFFORT_KEYS: Record<ThinkingEffort, string> = {
  low: 'effortLow',
  medium: 'effortMedium',
  high: 'effortHigh',
};

function EffortButton({
  selected,
  label,
  onClick,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'h-6 px-2 text-[11px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30',
        selected
          ? 'bg-muted font-medium text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function SimulationThinkingEffort({ value, onValueChange }: SimulationThinkingEffortProps) {
  const t = useTranslations('simulation');

  return (
    <div className="flex overflow-hidden rounded-md bg-muted/40">
      {EFFORT_OPTIONS.map((option) => (
        <EffortButton
          key={option}
          selected={option === value}
          label={t(EFFORT_KEYS[option])}
          onClick={() => onValueChange(option)}
        />
      ))}
    </div>
  );
}
