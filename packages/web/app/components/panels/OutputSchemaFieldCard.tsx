'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { OutputSchemaField } from '@daviddh/graph-types';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { OutputSchemaFieldType } from './outputSchemaTypes';
import {
  TYPE_BG_COLORS,
  TYPE_BORDER_COLORS,
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
  isArrayItem?: boolean;
}

interface EnumValuesEditorProps {
  values: string[];
  onChange: (values: string[]) => void;
}

function EnumValuesEditor({ values, onChange }: EnumValuesEditorProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((v, i) => (
        <EnumPill key={i} value={v} index={i} values={values} onChange={onChange} />
      ))}
      <button
        onClick={() => onChange([...values, ''])}
        className="px-1 text-xs text-muted-foreground hover:text-foreground"
      >
        +
      </button>
    </div>
  );
}

function EnumPill({
  value,
  index,
  values,
  onChange,
}: {
  value: string;
  index: number;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border bg-muted/40 px-1.5 py-0.5 h-6.5">
      <input
        value={value}
        onChange={(e) => onChange(values.map((val, j) => (j === index ? e.target.value : val)))}
        className="w-16 px-1 bg-transparent text-xs outline-none"
      />
      <button
        onClick={() => onChange(values.filter((_, j) => j !== index))}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        &times;
      </button>
    </div>
  );
}

function FieldNameInput({ name, onChange }: { name: string; onChange: (name: string) => void }) {
  const t = useTranslations('nodePanel');
  const nameInvalid = name !== '' && !isValidFieldName(name);

  return (
    <Input
      value={name}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('fieldNamePlaceholder')}
      className={`h-7 flex-1 text-xs ${nameInvalid ? 'border-destructive' : ''}`}
    />
  );
}

function FieldTypeSelect({
  type,
  availableTypes,
  onChange,
}: {
  type: OutputSchemaFieldType;
  availableTypes: OutputSchemaFieldType[];
  onChange: (type: OutputSchemaFieldType) => void;
}) {
  const handleValueChange = (value: OutputSchemaFieldType | null) => {
    if (value !== null) onChange(value);
  };

  return (
    <Select value={type} onValueChange={handleValueChange}>
      <SelectTrigger className="h-7 w-24 text-xs">
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
  );
}

function DeleteButton({ onRemove }: { onRemove: () => void }) {
  const t = useTranslations('nodePanel');
  return (
    <Button variant="destructive" onClick={onRemove} title={t('deleteField')}>
      <Trash2 className="size-3.5" />
    </Button>
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
  return (
    <div className="flex items-center gap-1">
      <Label className="shrink-0 w-[75px]">{'Name:'}</Label>
      <FieldNameInput name={field.name} onChange={(name) => onChange({ name })} />
      <FieldTypeSelect
        type={field.type}
        availableTypes={availableTypes}
        onChange={(type) => onChange({ type })}
      />
      <DeleteButton onRemove={onRemove} />
    </div>
  );
}

function NestedFieldList({
  fields,
  depth,
  onChange,
}: {
  fields: OutputSchemaField[];
  depth: number;
  onChange: (fields: OutputSchemaField[]) => void;
}) {
  const t = useTranslations('nodePanel');
  return (
    <div className="ml-1 mt-1 space-y-1">
      {fields.map((f, i) => (
        <OutputSchemaFieldCard
          key={i}
          field={f}
          depth={depth + 1}
          onChange={(updated) => onChange(updateFieldInList(fields, i, updated))}
          onRemove={() => onChange(removeFieldFromList(fields, i))}
        />
      ))}
      <button
        onClick={() => onChange([...fields, createEmptyField()])}
        className="ml-2 text-xs text-muted-foreground hover:text-foreground"
      >
        {t('addNestedField')}
      </button>
    </div>
  );
}

function ArrayItemEditor({
  items,
  depth,
  onChange,
}: {
  items: OutputSchemaField;
  depth: number;
  onChange: (updates: Partial<OutputSchemaField>) => void;
}) {
  return (
    <div className="ml-1 mt-1">
      <OutputSchemaFieldCard
        field={items}
        depth={depth + 1}
        onChange={(updated) => onChange({ items: updated })}
        onRemove={() => onChange({ items: createEmptyField() })}
        isArrayItem
      />
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

function FieldChildren({
  field,
  depth,
  onChange,
}: {
  field: OutputSchemaField;
  depth: number;
  onChange: (updates: Partial<OutputSchemaField>) => void;
}) {
  if (field.type === 'enum') {
    return null;
  }
  if (field.type === 'object') {
    return (
      <NestedFieldList
        fields={field.properties ?? []}
        depth={depth}
        onChange={(p) => onChange({ properties: p })}
      />
    );
  }
  if (field.type === 'array' && field.items) {
    return <ArrayItemEditor items={field.items} depth={depth} onChange={onChange} />;
  }
  return null;
}

function ArrayItemCard({
  field,
  depth,
  availableTypes,
  borderColor,
  bgColor,
  onChange,
}: {
  field: OutputSchemaField;
  depth: number;
  availableTypes: OutputSchemaFieldType[];
  borderColor: string;
  bgColor: string;
  onChange: (updates: Partial<OutputSchemaField>) => void;
}) {
  return (
    <div className={`group flex flex-col border-l-3 ${borderColor} ${bgColor} rounded-r py-0.5 pl-3`}>
      <div className="flex items-center gap-1">
        <Label className="shrink-0 w-[75px]">{'Item type:'}</Label>
        <FieldTypeSelect type={field.type} availableTypes={availableTypes} onChange={(type) => onChange({ type })} />
      </div>
      {field.type === 'enum' && (
        <div className="flex items-center gap-1 min-h-7 pt-1">
          <Label className="shrink-0 w-[75px]">{'Values:'}</Label>
          <EnumValuesEditor values={field.enumValues ?? ['']} onChange={(v) => onChange({ enumValues: v })} />
        </div>
      )}
      <FieldChildren field={field} depth={depth} onChange={onChange} />
    </div>
  );
}

export function OutputSchemaFieldCard({ field, depth, onChange, onRemove, isArrayItem }: FieldCardProps) {
  const t = useTranslations('nodePanel');
  const availableTypes = getAvailableTypes(depth);
  const borderColor = TYPE_BORDER_COLORS[field.type];
  const bgColor = TYPE_BG_COLORS[field.type];

  const handleChange = (updates: Partial<OutputSchemaField>) => {
    onChange(applyTypeDefaults(field, updates));
  };

  if (isArrayItem) {
    return (
      <ArrayItemCard
        field={field}
        depth={depth}
        availableTypes={availableTypes}
        borderColor={borderColor}
        bgColor={bgColor}
        onChange={handleChange}
      />
    );
  }

  return (
    <div className={`group flex flex-col border-l-3 ${borderColor} ${bgColor} rounded-r py-0.5 pl-3`}>
      <FieldHeader
        field={field}
        availableTypes={availableTypes}
        onChange={handleChange}
        onRemove={onRemove}
      />
      {field.type === 'enum' && (
        <div className="flex items-center gap-1 min-h-7 pt-1">
          <Label className="shrink-0 w-[75px]">{'Values:'}</Label>
          <EnumValuesEditor
            values={field.enumValues ?? ['']}
            onChange={(v) => handleChange({ enumValues: v })}
          />
        </div>
      )}
      <div className="mt-1 flex items-center gap-1">
        <Label className="shrink-0 w-[75px]">{'Description:'}</Label>
        <Input
          value={field.description ?? ''}
          onChange={(e) => handleChange({ description: e.target.value || undefined })}
          placeholder={t('fieldDescriptionPlaceholder')}
          className="h-7 text-xs"
        />
      </div>
      <div className="mt-1 flex h-7 items-center gap-1">
        <Label className="shrink-0 w-[75px]">{'Required:'}</Label>
        <Checkbox
          checked={field.required}
          onCheckedChange={(checked) => handleChange({ required: checked === true })}
        />
        <span className="ml-0.5 text-muted-foreground">
          {'(specifies if this field is optional or always required)'}
        </span>
      </div>

      <FieldChildren field={field} depth={depth} onChange={handleChange} />
    </div>
  );
}
