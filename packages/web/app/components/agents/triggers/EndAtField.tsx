'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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

function EndModeRadio({ mode, label }: { mode: EndMode; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <RadioGroupItem value={mode} className="size-3" />
      <span className="text-xs font-medium leading-none">{label}</span>
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
      <span className="self-center text-xs font-medium text-foreground">{t('endsAt')}</span>
      <RadioGroup
        value={mode}
        onValueChange={handleModeChange}
        className="col-span-2 grid min-h-7 max-h-7 grid-cols-subgrid items-center gap-x-3"
      >
        <EndModeRadio mode="never" label={t('endMode.never')} />
        <div className="flex items-center gap-x-3">
          <EndModeRadio mode="specific" label={t('endMode.specific')} />
          {mode === 'specific' && <DateTimePicker value={value} onChange={onChange} />}
        </div>
      </RadioGroup>
    </>
  );
}
