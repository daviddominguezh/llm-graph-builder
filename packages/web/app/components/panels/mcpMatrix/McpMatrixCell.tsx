'use client';

import type { OrgEnvVariableRow } from '@/app/lib/orgEnvVariables';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTranslations } from 'next-intl';

import type { VariableValue } from '../VariableValuesEditor';
import { EnvRefSelector } from '../VariableValuesEditor';
import { isEnvRef, toggleCellMode } from './mcpMatrixCellLogic';

export interface McpMatrixCellProps {
  value: VariableValue;
  envVars: OrgEnvVariableRow[];
  onChange: (value: VariableValue) => void;
}

interface CellToggleProps {
  useEnvRef: boolean;
  label: string;
  onToggle: (useEnvRef: boolean) => void;
}

function CellToggle({ useEnvRef, label, onToggle }: CellToggleProps) {
  return (
    <Label className="flex items-center gap-1.5 text-[0.625rem] text-muted-foreground">
      <Switch size="sm" checked={useEnvRef} onCheckedChange={onToggle} />
      {label}
    </Label>
  );
}

export function McpMatrixCell({ value, envVars, onChange }: McpMatrixCellProps) {
  const t = useTranslations('mcpMatrix');
  const tLib = useTranslations('mcpLibrary');
  const useEnvRef = isEnvRef(value);

  return (
    <div className="flex flex-col gap-1">
      <CellToggle
        useEnvRef={useEnvRef}
        label={t('useEnvVar')}
        onToggle={(on) => onChange(toggleCellMode(value, on))}
      />
      {useEnvRef ? (
        <>
          <EnvRefSelector
            envVariableId={value.envVariableId}
            envVariables={envVars}
            t={tLib}
            onChange={(id) => onChange({ type: 'env_ref', envVariableId: id })}
          />
          <Badge variant="secondary">{t('envShared')}</Badge>
        </>
      ) : (
        <>
          <Input
            value={value.value ?? ''}
            onChange={(e) => onChange({ type: 'direct', value: e.target.value })}
            placeholder={tLib('valuePlaceholder')}
            className="text-sm"
          />
          <span className="text-[0.625rem] text-muted-foreground">{t('secretWarning')}</span>
        </>
      )}
    </div>
  );
}
