'use client';

import type { OutputSchemaEntity } from '@daviddh/graph-types';
import { useTranslations } from 'next-intl';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  schemas: OutputSchemaEntity[];
  value: string | null;
  onChange: (schemaId: string) => void;
  disabled?: boolean;
}

export function FormDialogSchemaPicker({ schemas, value, onChange, disabled }: Props) {
  const t = useTranslations('forms.field.schema');

  const handleValueChange = (selected: string | null): void => {
    if (selected !== null) {
      onChange(selected);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Label>{t('label')}</Label>
      <Select value={value ?? ''} onValueChange={handleValueChange} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue>
            {value !== null && value !== ''
              ? (schemas.find((s) => s.id === value)?.name ?? t('placeholder'))
              : t('placeholder')}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {schemas.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {disabled === true && <p className="text-xs text-muted-foreground">{t('immutableHelp')}</p>}
    </div>
  );
}
