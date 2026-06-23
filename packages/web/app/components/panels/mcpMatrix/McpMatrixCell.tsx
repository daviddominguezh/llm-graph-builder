'use client';

import type { OrgEnvVariableRow } from '@/app/lib/orgEnvVariables';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useTranslations } from 'next-intl';

import type { VariableValue } from '../VariableValuesEditor';
import { EnvRefSelector } from '../VariableValuesEditor';
import { isEnvRef, toggleCellMode } from './mcpMatrixCellLogic';

export interface McpMatrixCellProps {
  value: VariableValue;
  envVars: OrgEnvVariableRow[];
  onChange: (value: VariableValue) => void;
}

interface CellModeSelectProps {
  useEnvRef: boolean;
  directLabel: string;
  envLabel: string;
  onChange: (useEnvRef: boolean) => void;
}

function CellModeSelect({ useEnvRef, directLabel, envLabel, onChange }: CellModeSelectProps) {
  function handleModeChange(mode: string | null) {
    if (mode !== null) onChange(mode === 'env_ref');
  }

  return (
    <Select value={useEnvRef ? 'env_ref' : 'direct'} onValueChange={handleModeChange}>
      <SelectTrigger size="sm" className="w-full text-xs">
        <span className="flex flex-1 text-left">{useEnvRef ? envLabel : directLabel}</span>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        <SelectItem value="direct">{directLabel}</SelectItem>
        <SelectItem value="env_ref">{envLabel}</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function McpMatrixCell({ value, envVars, onChange }: McpMatrixCellProps) {
  const t = useTranslations('mcpMatrix');
  const tLib = useTranslations('mcpLibrary');
  const useEnvRef = isEnvRef(value);

  return (
    <div className="flex w-full flex-col gap-1">
      <CellModeSelect
        useEnvRef={useEnvRef}
        directLabel={t('directMode')}
        envLabel={t('envRefMode')}
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
