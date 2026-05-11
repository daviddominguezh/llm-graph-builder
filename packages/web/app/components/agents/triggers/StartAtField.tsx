'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';

import { DateTimePicker } from './DateTimePicker';

interface StartAtFieldProps {
  value: string;
  onChange: (next: string) => void;
}

type StartMode = 'now' | 'specific';

const MODES: StartMode[] = ['now', 'specific'];
const DEFAULT_FUTURE_OFFSET_HOURS = 1;
const ISO_NO_SECONDS = 'YYYY-MM-DDTHH:mm';

function deriveMode(value: string): StartMode {
  return value === '' ? 'now' : 'specific';
}

function defaultSpecificValue(): string {
  return dayjs().add(DEFAULT_FUTURE_OFFSET_HOURS, 'hour').format(ISO_NO_SECONDS);
}

function StartModeRadio({ mode, label }: { mode: StartMode; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <RadioGroupItem value={mode} className="size-3" />
      <span className="text-xs font-medium leading-none">{label}</span>
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm leading-relaxed">
      <span className="text-muted-foreground">{t('startingAt')}</span>
      <RadioGroup
        value={mode}
        onValueChange={handleModeChange}
        className="flex w-auto flex-row items-center gap-x-3 gap-y-1"
      >
        {MODES.map((m) => (
          <StartModeRadio key={m} mode={m} label={t(`startMode.${m}`)} />
        ))}
      </RadioGroup>
      {mode === 'specific' && <DateTimePicker value={value} onChange={onChange} />}
    </div>
  );
}
