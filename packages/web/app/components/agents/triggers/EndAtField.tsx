'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';

import { DateTimePicker } from './DateTimePicker';

interface EndAtFieldProps {
  value: string;
  onChange: (next: string) => void;
}

type EndMode = 'never' | 'specific';

const DEFAULT_FUTURE_OFFSET_DAYS = 7;
const ISO_NO_SECONDS = 'YYYY-MM-DDTHH:mm';

function deriveMode(value: string): EndMode {
  return value === '' ? 'never' : 'specific';
}

function defaultSpecificValue(): string {
  return dayjs().add(DEFAULT_FUTURE_OFFSET_DAYS, 'day').format(ISO_NO_SECONDS);
}

function EndModeRadio({ mode, label, selected }: { mode: EndMode; label: string; selected: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <RadioGroupItem value={mode} className="size-3" />
      <span
        className={cn('text-xs font-medium leading-none', !selected && 'text-muted-foreground')}
      >
        {label}
      </span>
    </label>
  );
}

export function EndAtField({ value, onChange }: EndAtFieldProps) {
  const t = useTranslations('editor.triggers');
  const mode = deriveMode(value);
  const handleModeChange = (next: string) => {
    onChange(next === 'never' ? '' : value || defaultSpecificValue());
  };
  return (
    <>
      <span className="self-center text-xs font-medium leading-tight text-muted-foreground">{t('endsAt')}</span>
      <RadioGroup
        value={mode}
        onValueChange={handleModeChange}
        className="col-span-2 grid min-h-7 max-h-7 grid-cols-subgrid items-center gap-x-3"
      >
        <EndModeRadio mode="never" label={t('endMode.never')} selected={mode === 'never'} />
        <div className="flex items-center gap-x-3">
          <EndModeRadio
            mode="specific"
            label={t('endMode.specific')}
            selected={mode === 'specific'}
          />
          {mode === 'specific' && <DateTimePicker value={value} onChange={onChange} />}
        </div>
      </RadioGroup>
    </>
  );
}
