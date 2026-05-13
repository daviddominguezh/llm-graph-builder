'use client';

import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

import { WEEKDAYS, type Weekday } from './types';

interface WeekdayPickerProps {
  selected: Weekday[];
  onToggle: (day: Weekday) => void;
}

const CHIP_BASE =
  'cursor-pointer inline-flex h-7 min-w-9 items-center justify-center rounded-md border px-2 text-xs font-medium transition duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-95 motion-reduce:transform-none motion-reduce:transition-none';
const CHIP_ACTIVE = 'bg-primary text-primary-foreground border-primary';
const CHIP_INACTIVE = 'bg-input text-foreground border-transparent hover:bg-ring/30';

export function WeekdayPicker({ selected, onToggle }: WeekdayPickerProps) {
  const t = useTranslations('editor.triggers.weekdays');
  return (
    <div className="inline-flex flex-wrap gap-1">
      {WEEKDAYS.map((day) => {
        const active = selected.includes(day);
        return (
          <button
            key={day}
            type="button"
            onClick={() => onToggle(day)}
            aria-pressed={active}
            className={cn(CHIP_BASE, active ? CHIP_ACTIVE : CHIP_INACTIVE)}
          >
            {t(day)}
          </button>
        );
      })}
    </div>
  );
}
