'use client';

import type { OrgEnvVariableRow } from '@/app/lib/orgEnvVariables';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';

import type { VariableValue } from '../VariableValuesEditor';
import { EnvRefSelector } from '../VariableValuesEditor';
import { isEnvRef, toggleCellMode } from './mcpMatrixCellLogic';

// Persist on a trailing debounce so typing isn't round-tripped (and reset) per
// keystroke; the input is locally controlled so it never flickers mid-type.
const DEBOUNCE_MS = 800;

export interface McpMatrixCellProps {
  value: VariableValue;
  envVars: OrgEnvVariableRow[];
  onChange: (value: VariableValue) => void;
}

interface DirectValueInputProps {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

function DirectValueInput({ value, placeholder, onChange }: DirectValueInputProps) {
  const [text, setText] = useState(value);
  // Local state is authoritative while editing; re-sync only when the persisted
  // value changes externally (switching tenants/cells, mode toggle, reset).
  useEffect(() => {
    setText(value);
  }, [value]);
  const debounced = useDebouncedCallback(onChange, DEBOUNCE_MS);
  return (
    <Input
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        debounced(e.target.value);
      }}
      onBlur={() => debounced.flush()}
      placeholder={placeholder}
      className="text-sm"
    />
  );
}

interface CellModeToggleProps {
  useEnvRef: boolean;
  directLabel: string;
  envLabel: string;
  onChange: (useEnvRef: boolean) => void;
}

function CellModeToggle({ useEnvRef, directLabel, envLabel, onChange }: CellModeToggleProps) {
  return (
    <RadioGroup
      value={useEnvRef ? 'env_ref' : 'direct'}
      onValueChange={(v) => onChange(v === 'env_ref')}
      className="flex w-auto flex-row flex-wrap items-center gap-x-3 gap-y-1"
    >
      <label className="flex cursor-pointer items-center gap-1.5">
        <RadioGroupItem value="direct" className="size-3" />
        <span className="text-[10px] font-medium leading-none">{directLabel}</span>
      </label>
      <label className="flex cursor-pointer items-center gap-1.5">
        <RadioGroupItem value="env_ref" className="size-3" />
        <span className="text-[10px] font-medium leading-none">{envLabel}</span>
      </label>
    </RadioGroup>
  );
}

export function McpMatrixCell({ value, envVars, onChange }: McpMatrixCellProps) {
  const t = useTranslations('mcpMatrix');
  const tLib = useTranslations('mcpLibrary');
  const useEnvRef = isEnvRef(value);

  return (
    <div className="flex w-full flex-col gap-2">
      <CellModeToggle
        useEnvRef={useEnvRef}
        directLabel={t('directModeShort')}
        envLabel={t('envRefModeShort')}
        onChange={(on) => onChange(toggleCellMode(value, on))}
      />
      {useEnvRef ? (
        <EnvRefSelector
          envVariableId={value.envVariableId}
          envVariables={envVars}
          t={tLib}
          onChange={(id) => onChange({ type: 'env_ref', envVariableId: id })}
        />
      ) : (
        <DirectValueInput
          value={value.value ?? ''}
          placeholder={tLib('valuePlaceholder')}
          onChange={(v) => onChange({ type: 'direct', value: v })}
        />
      )}
    </div>
  );
}
