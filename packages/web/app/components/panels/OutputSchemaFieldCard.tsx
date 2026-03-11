'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { OutputSchemaField } from '@daviddh/graph-types';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { OutputSchemaFieldType } from './outputSchemaTypes';
import {
  createEmptyField,
  getAvailableTypes,
  isValidFieldName,
  removeFieldFromList,
  updateFieldInList,
} from './outputSchemaTypes';

interface FieldCardProps {
  field: OutputSchemaField;
  depth: number;
  onChange: (updated: OutputSchemaField) => void;
  onRemove: () => void;
}

function EnumValuesEditor({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  const t = useTranslations('nodePanel');
  return (
    <div className="ml-4 mt-1 space-y-1">
      <Label className="text-[10px]">{t('enumValues')}</Label>
      {values.map((v, i) => (
        <div key={i} className="flex gap-1">
          <Input
            value={v}
            onChange={(e) => onChange(values.map((val, j) => (j === i ? e.target.value : val)))}
            className="h-6 text-xs"
          />
          <Button variant="ghost" size="icon-xs" onClick={() => onChange(values.filter((_, j) => j !== i))}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="xs" onClick={() => onChange([...values, ''])}>
        <Plus className="h-3 w-3 mr-1" />
        {t('addEnumValue')}
      </Button>
    </div>
  );
}

function FieldHeader({
  field,
  availableTypes,
  onChange,
  onRemove,
}: {
  field: OutputSchemaField;
  availableTypes: OutputSchemaFieldType[];
  onChange: (updates: Partial<OutputSchemaField>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('nodePanel');
  const nameInvalid = field.name !== '' && !isValidFieldName(field.name);

  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={field.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder={t('fieldNamePlaceholder')}
        className={`h-6 flex-1 text-xs ${nameInvalid ? 'border-destructive' : ''}`}
      />
      <Select value={field.type} onValueChange={(v) => onChange({ type: v as OutputSchemaFieldType })}>
        <SelectTrigger className="h-6 w-24 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {availableTypes.map((fieldType) => (
            <SelectItem key={fieldType} value={fieldType}>
              {fieldType}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1">
        <Checkbox
          checked={field.required}
          onCheckedChange={(checked) => onChange({ required: checked === true })}
        />
        <span className="text-[10px] text-muted-foreground">{t('fieldRequired')}</span>
      </div>
      <Button variant="ghost" size="icon-xs" onClick={onRemove} title={t('deleteField')}>
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

function FieldDescription({
  description,
  onChange,
}: {
  description: string | undefined;
  onChange: (desc: string | undefined) => void;
}) {
  const t = useTranslations('nodePanel');
  return (
    <Input
      value={description ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      placeholder={t('fieldDescriptionPlaceholder')}
      className="h-6 text-xs"
    />
  );
}

function NestedFieldList({
  fields,
  depth,
  label,
  onChange,
}: {
  fields: OutputSchemaField[];
  depth: number;
  label: string;
  onChange: (fields: OutputSchemaField[]) => void;
}) {
  const t = useTranslations('nodePanel');
  return (
    <div className="ml-3 mt-1 space-y-2 border-l-2 border-zinc-200 pl-3">
      <Label className="text-[10px]">{label}</Label>
      {fields.map((f, i) => (
        <OutputSchemaFieldCard
          key={i}
          field={f}
          depth={depth + 1}
          onChange={(updated) => onChange(updateFieldInList(fields, i, updated))}
          onRemove={() => onChange(removeFieldFromList(fields, i))}
        />
      ))}
      <Button variant="ghost" size="xs" onClick={() => onChange([...fields, createEmptyField()])}>
        <Plus className="h-3 w-3 mr-1" />
        {t('addField')}
      </Button>
    </div>
  );
}

function applyTypeDefaults(field: OutputSchemaField, updates: Partial<OutputSchemaField>): OutputSchemaField {
  const merged = { ...field, ...updates };
  if (updates.type !== undefined && updates.type !== field.type) {
    merged.enumValues = updates.type === 'enum' ? [''] : undefined;
    merged.properties = updates.type === 'object' ? [] : undefined;
    merged.items = updates.type === 'array' ? createEmptyField() : undefined;
  }
  return merged;
}

export function OutputSchemaFieldCard({ field, depth, onChange, onRemove }: FieldCardProps) {
  const t = useTranslations('nodePanel');
  const availableTypes = getAvailableTypes(depth);

  const handleChange = (updates: Partial<OutputSchemaField>) => {
    onChange(applyTypeDefaults(field, updates));
  };

  return (
    <Card className="space-y-1.5 p-2">
      <FieldHeader field={field} availableTypes={availableTypes} onChange={handleChange} onRemove={onRemove} />
      <FieldDescription description={field.description} onChange={(d) => handleChange({ description: d })} />
      {field.type === 'enum' && (
        <EnumValuesEditor values={field.enumValues ?? ['']} onChange={(v) => handleChange({ enumValues: v })} />
      )}
      {field.type === 'object' && (
        <NestedFieldList
          fields={field.properties ?? []}
          depth={depth}
          label={t('objectProperties')}
          onChange={(p) => handleChange({ properties: p })}
        />
      )}
      {field.type === 'array' && field.items && (
        <div className="ml-3 mt-1 border-l-2 border-orange-200 pl-3">
          <Label className="text-[10px]">{t('arrayItems')}</Label>
          <OutputSchemaFieldCard
            field={field.items}
            depth={depth + 1}
            onChange={(updated) => handleChange({ items: updated })}
            onRemove={() => handleChange({ items: createEmptyField() })}
          />
        </div>
      )}
    </Card>
  );
}
