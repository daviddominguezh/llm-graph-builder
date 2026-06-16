'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';

import { DateTimePicker } from './DateTimePicker';

interface StartAtFieldProps {
  value: string;
  onChange: (next: string) => void;
}

type StartMode = 'now' | 'specific';

const DEFAULT_FUTURE_OFFSET_HOURS = 1;
const ISO_NO_SECONDS = 'YYYY-MM-DDTHH:mm';

function deriveMode(value: string): StartMode {
  return value === '' ? 'now' : 'specific';
}

function defaultSpecificValue(): string {
  return dayjs().add(DEFAULT_FUTURE_OFFSET_HOURS, 'hour').format(ISO_NO_SECONDS);
}

function StartModeRadio({ mode, label, selected }: { mode: StartMode; label: string; selected: boolean }) {
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

export function StartAtField({ value, onChange }: StartAtFieldProps) {
  const t = useTranslations('editor.triggers');
  const mode = deriveMode(value);
  const handleModeChange = (next: string) => {
    onChange(next === 'now' ? '' : value || defaultSpecificValue());
  };
  return (
    <>
      <span className="self-center text-xs font-medium leading-tight text-muted-foreground">{t('startingAt')}</span>
      <RadioGroup
        value={mode}
        onValueChange={handleModeChange}
        className="col-span-2 grid min-h-7 max-h-7 grid-cols-subgrid items-center gap-x-3"
      >
        <StartModeRadio mode="now" label={t('startMode.now')} selected={mode === 'now'} />
        <div className="flex items-center gap-x-3">
          <StartModeRadio
            mode="specific"
            label={t('startMode.specific')}
            selected={mode === 'specific'}
          />
          {mode === 'specific' && <DateTimePicker value={value} onChange={onChange} />}
        </div>
      </RadioGroup>
    </>
  );
}
