'use client';

import type { OrgEnvVariableRow } from '@/app/lib/orgEnvVariables';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useTranslations } from 'next-intl';

import type { VariableValue } from '../VariableValuesEditor';
import { EnvRefSelector } from '../VariableValuesEditor';
import { isEnvRef, toggleCellMode } from './mcpMatrixCellLogic';

export interface McpMatrixCellProps {
  value: VariableValue;
  envVars: OrgEnvVariableRow[];
  onChange: (value: VariableValue) => void;
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
        <Input
          value={value.value ?? ''}
          onChange={(e) => onChange({ type: 'direct', value: e.target.value })}
          placeholder={tLib('valuePlaceholder')}
          className="text-sm"
        />
      )}
    </div>
  );
}
