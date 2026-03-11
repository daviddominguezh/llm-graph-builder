'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
} from '@/components/ui/select';
import type { OutputSchemaEntity } from '@daviddh/graph-types';
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';

const NONE_VALUE = '__none__';
const NEW_VALUE = '__new__';

interface OutputSchemaSelectProps {
  schemas: OutputSchemaEntity[];
  value: string | undefined;
  onChange: (schemaId: string | undefined) => void;
  onAddSchema: () => void;
  onEditSchema: (id: string) => void;
  disabled?: boolean;
}

function handleChange(
  selected: string | null,
  onChange: (schemaId: string | undefined) => void,
  onAddSchema: () => void
): void {
  if (!selected) return;
  if (selected === NEW_VALUE) {
    onAddSchema();
    return;
  }
  onChange(selected === NONE_VALUE ? undefined : selected);
}

function getDisplayLabel(
  value: string | undefined,
  schemas: OutputSchemaEntity[],
  noneLabel: string
): string {
  if (value === undefined || value === NONE_VALUE) return noneLabel;
  const schema = schemas.find((s) => s.id === value);
  return schema?.name ?? noneLabel;
}

export function OutputSchemaSelect({
  schemas,
  value,
  onChange,
  onAddSchema,
  onEditSchema,
  disabled,
}: OutputSchemaSelectProps) {
  const t = useTranslations('nodePanel');
  const tSchemas = useTranslations('outputSchemas');
  const displayLabel = getDisplayLabel(value, schemas, tSchemas('none'));

  return (
    <div className="space-y-2">
      <Label>{t('outputSchema')}</Label>
      <div className="flex items-center gap-1">
        <Select
          value={value ?? NONE_VALUE}
          onValueChange={(v) => handleChange(v, onChange, onAddSchema)}
        >
          <SelectTrigger className="h-8 flex-1 text-xs" disabled={disabled}>
            <span className="flex flex-1 text-left truncate">{displayLabel}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>{tSchemas('none')}</SelectItem>
            {schemas.map((schema) => (
              <SelectItem key={schema.id} value={schema.id}>
                {schema.name}
              </SelectItem>
            ))}
            <SelectSeparator />
            <SelectItem value={NEW_VALUE}>{tSchemas('newSchema')}</SelectItem>
          </SelectContent>
        </Select>
        {value !== undefined && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onEditSchema(value)}
            title={tSchemas('editSchema')}
          >
            <Pencil className="size-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
