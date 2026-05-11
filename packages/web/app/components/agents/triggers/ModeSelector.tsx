'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

import type { ScheduleMode } from './types';

interface ModeOption {
  id: ScheduleMode;
  disabled?: boolean;
}

const MODES: ModeOption[] = [{ id: 'recurring' }, { id: 'once' }, { id: 'after-event', disabled: true }];

interface ModeSelectorProps {
  value: ScheduleMode;
  onChange: (next: ScheduleMode) => void;
}

interface ModeRadioProps {
  option: ModeOption;
  label: string;
  soonLabel: string;
}

function ModeRadio({ option, label, soonLabel }: ModeRadioProps) {
  const disabled = Boolean(option.disabled);
  return (
    <label
      className={cn(
        'flex items-center gap-1.5',
        disabled ? 'cursor-not-allowed text-muted-foreground/60' : 'cursor-pointer'
      )}
    >
      <RadioGroupItem value={option.id} className="size-3" disabled={disabled} />
      <span className="text-xs font-medium leading-none">{label}</span>
      {disabled && (
        <span className="rounded-sm bg-foreground/10 px-1 py-px text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {soonLabel}
        </span>
      )}
    </label>
  );
}

export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  const t = useTranslations('editor.triggers.mode');
  const tCommon = useTranslations('editor.triggers');
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as ScheduleMode)}
      className="flex w-auto flex-row flex-wrap items-center gap-x-3 gap-y-1"
    >
      {MODES.map((option) => (
        <ModeRadio key={option.id} option={option} label={t(option.id)} soonLabel={tCommon('soon')} />
      ))}
    </RadioGroup>
  );
}
