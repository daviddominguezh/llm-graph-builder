'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ValidationRule } from '@daviddh/llm-graph-runner';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import { FormValidationLengthInput } from './FormValidationLengthInput';

type LeafType = 'string' | 'number' | 'enum' | 'boolean' | 'object' | 'array';

interface Props {
  path: string;
  type: LeafType;
  rule: ValidationRule | null;
  onChange: (rule: ValidationRule | null) => void;
  indent?: number;
}

const INDENT_PX = 16;

export function FormValidationRow({ path, type, rule, onChange, indent = 0 }: Props): ReactElement {
  const t = useTranslations('forms.validations');
  const kinds = allowedKinds(type);
  const disabled = kinds.length === 0;
  const selected = rule?.kind ?? 'none';
  const labelKey = (k: string): string => (k === 'length' && type === 'number' ? 'kind.range' : `kind.${k}`);

  return (
    <div className="flex items-center gap-2 py-1" style={{ paddingLeft: indent * INDENT_PX }}>
      <code className="min-w-[160px] text-xs text-foreground">{path}</code>
      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
        {type}
      </span>
      {disabled ? (
        <span className="text-xs text-muted-foreground">{t('kind.unavailable')}</span>
      ) : (
        <Select
          value={selected}
          onValueChange={(v: string | null): void => {
            if (v !== null) {
              onChange(v === 'none' ? null : ruleFromKind(v));
            }
          }}
        >
          <SelectTrigger className="h-7 w-[200px]">
            <SelectValue>{t(labelKey(selected))}</SelectValue>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            <SelectItem value="none">{t('kind.none')}</SelectItem>
            {kinds.map((k) => (
              <SelectItem key={k} value={k}>
                {t(labelKey(k))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {rule?.kind === 'length' && (
        <FormValidationLengthInput value={rule} onChange={(p): void => onChange({ kind: 'length', ...p })} />
      )}
    </div>
  );
}

function allowedKinds(type: LeafType): string[] {
  if (type === 'string') {
    return ['email', 'twoWordName', 'pastDate', 'futureDate', 'pastHour', 'futureHour', 'length'];
  }
  if (type === 'number') return ['length'];
  return [];
}

function ruleFromKind(kind: string): ValidationRule {
  if (kind === 'length') return { kind: 'length' };
  return { kind: kind as Exclude<ValidationRule['kind'], 'length'> };
}
