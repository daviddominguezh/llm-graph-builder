'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import type { LengthPayload } from '@daviddh/llm-graph-runner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  value: LengthPayload;
  onChange: (next: LengthPayload) => void;
}

type Mode = 'range' | 'exact';

export function FormValidationLengthInput({ value, onChange }: Props) {
  const t = useTranslations('forms.validations.length');
  const initialMode: Mode = value.exact !== undefined ? 'exact' : 'range';
  const [mode, setMode] = useState<Mode>(initialMode);

  const switchToRange = (): void => {
    setMode('range');
    onChange({ min: value.min, max: value.max });
  };
  const switchToExact = (): void => {
    setMode('exact');
    onChange({ exact: value.exact });
  };

  return (
    <div className="flex flex-col gap-2">
      <ModeRadios mode={mode} onRange={switchToRange} onExact={switchToExact} t={t} />
      {mode === 'range' ? (
        <RangeInputs value={value} onChange={onChange} t={t} />
      ) : (
        <ExactInput value={value} onChange={onChange} t={t} />
      )}
    </div>
  );
}

interface ModeRadiosProps {
  mode: Mode;
  onRange: () => void;
  onExact: () => void;
  t: ReturnType<typeof useTranslations>;
}

function ModeRadios({ mode, onRange, onExact, t }: ModeRadiosProps) {
  return (
    <div className="flex gap-3 text-xs">
      <label className="flex items-center gap-1">
        <input type="radio" name="length-mode" checked={mode === 'range'} onChange={onRange} />
        {t('mode.range')}
      </label>
      <label className="flex items-center gap-1">
        <input type="radio" name="length-mode" checked={mode === 'exact'} onChange={onExact} />
        {t('mode.exact')}
      </label>
    </div>
  );
}

interface RangeInputsProps {
  value: LengthPayload;
  onChange: (n: LengthPayload) => void;
  t: ReturnType<typeof useTranslations>;
}

function RangeInputs({ value, onChange, t }: RangeInputsProps) {
  return (
    <div className="flex items-center gap-2">
      <NumberField
        label={t('min')}
        value={value.min}
        onChange={(n) => onChange({ min: n, max: value.max })}
      />
      <NumberField
        label={t('max')}
        value={value.max}
        onChange={(n) => onChange({ min: value.min, max: n })}
      />
    </div>
  );
}

function ExactInput({ value, onChange, t }: RangeInputsProps) {
  return (
    <NumberField label={t('exact')} value={value.exact} onChange={(n) => onChange({ exact: n })} />
  );
}

interface NumberFieldProps {
  label: string;
  value?: number;
  onChange: (n?: number) => void;
}

function NumberField({ label, value, onChange }: NumberFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        className="h-7 w-24"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    </div>
  );
}
