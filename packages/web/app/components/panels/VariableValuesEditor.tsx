'use client';

import { useTranslations } from 'next-intl';

import type { OrgEnvVariableRow } from '@/app/lib/org-env-variables';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface VariableValue {
  type: 'direct' | 'env_ref';
  value?: string;
  envVariableId?: string;
}

interface VariableValuesEditorProps {
  variables: Array<{ name: string; description?: string }>;
  values: Record<string, VariableValue>;
  envVariables: OrgEnvVariableRow[];
  onChange: (values: Record<string, VariableValue>) => void;
}

type TranslationFn = ReturnType<typeof useTranslations<'mcpLibrary'>>;

interface DirectValueInputProps {
  value: string | undefined;
  t: TranslationFn;
  onChange: (value: string) => void;
}

function DirectValueInput({ value, t, onChange }: DirectValueInputProps) {
  return (
    <Input
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('valuePlaceholder')}
      className="text-sm"
    />
  );
}

interface EnvRefSelectorProps {
  envVariableId: string | undefined;
  envVariables: OrgEnvVariableRow[];
  t: TranslationFn;
  onChange: (id: string) => void;
}

function EnvRefSelector({ envVariableId, envVariables, t, onChange }: EnvRefSelectorProps) {
  function handleChange(v: string | null) {
    if (v !== null) onChange(v);
  }

  return (
    <Select value={envVariableId ?? ''} onValueChange={handleChange}>
      <SelectTrigger className="w-full text-xs">
        <SelectValue placeholder={t('selectEnvVar')} />
      </SelectTrigger>
      <SelectContent>
        {envVariables.map((ev) => (
          <SelectItem key={ev.id} value={ev.id}>
            {ev.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface VariableRowProps {
  variable: { name: string; description?: string };
  variableValue: VariableValue;
  envVariables: OrgEnvVariableRow[];
  t: TranslationFn;
  onChange: (newValue: VariableValue) => void;
}

function VariableRow({ variable, variableValue, envVariables, t, onChange }: VariableRowProps) {
  function handleModeChange(mode: string | null) {
    if (mode === 'env_ref') {
      onChange({ type: 'env_ref', envVariableId: '' });
    } else {
      onChange({ type: 'direct', value: '' });
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{variable.name}</Label>
      <Select value={variableValue.type} onValueChange={handleModeChange}>
        <SelectTrigger className="w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="direct">{t('directValue')}</SelectItem>
          <SelectItem value="env_ref">{t('envVariable')}</SelectItem>
        </SelectContent>
      </Select>
      {variableValue.type === 'direct' ? (
        <DirectValueInput
          value={variableValue.value}
          t={t}
          onChange={(v) => onChange({ ...variableValue, value: v })}
        />
      ) : (
        <EnvRefSelector
          envVariableId={variableValue.envVariableId}
          envVariables={envVariables}
          t={t}
          onChange={(id) => onChange({ ...variableValue, envVariableId: id })}
        />
      )}
    </div>
  );
}

export function VariableValuesEditor({ variables, values, envVariables, onChange }: VariableValuesEditorProps) {
  const t = useTranslations('mcpLibrary');

  if (variables.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <Label className="text-xs font-semibold">{t('variables')}</Label>
      {variables.map((variable) => (
        <VariableRow
          key={variable.name}
          variable={variable}
          variableValue={values[variable.name] ?? { type: 'direct' }}
          envVariables={envVariables}
          t={t}
          onChange={(newValue) => onChange({ ...values, [variable.name]: newValue })}
        />
      ))}
    </div>
  );
}
