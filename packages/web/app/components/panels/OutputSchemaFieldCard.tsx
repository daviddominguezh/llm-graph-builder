'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
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
  usedByFormSlugs?: string[];
}

function FieldUsageWarning({ slugs }: { slugs: string[] }) {
  const tWarn = useTranslations('outputSchemas.warnings');
  if (slugs.length === 0) return null;
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {tWarn('fieldUsed', { form: slugs.join(', ') })}
    </p>
  );
}

interface EnumValuesEditorProps {
  values: string[];
  onChange: (values: string[]) => void;
}

function EnumValuesEditor({ values, onChange }: EnumValuesEditorProps) {
  const t = useTranslations('nodePanel');
  return (
    <div className="flex flex-wrap items-center gap-1">
      {values.map((v, i) => (
        <InputGroup key={i} className="w-28">
          <InputGroupInput
            value={v}
            onChange={(e) => onChange(values.map((val, j) => (j === i ? e.target.value : val)))}
            placeholder={t('enumValuePlaceholder')}
            className="h-7 text-xs"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" onClick={() => onChange(values.filter((_, j) => j !== i))}>
              <span className="text-xs">&times;</span>
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      ))}
      <Button variant="ghost" size="icon-xs" onClick={() => onChange([...values, ''])}>
        <span className="text-xs">+</span>
      </Button>
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
      <Button
        variant="ghost"
        onClick={() => onChange([...fields, createEmptyField()])}
        className="ml-2 h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
      >
        {t('addNestedField')}
      </Button>
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

function FieldDescriptionRow({
  description,
  onChange,
}: {
  description: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const t = useTranslations('nodePanel');
  return (
    <div className="mt-1 flex items-center gap-1">
      <Label className="shrink-0 w-[75px]">{'Description:'}</Label>
      <Input
        value={description ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder={t('fieldDescriptionPlaceholder')}
        className="h-7 text-xs"
      />
    </div>
  );
}

function FieldRequiredRow({
  required,
  onChange,
}: {
  required: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="mt-1 flex h-7 items-center gap-1">
      <Label className="shrink-0 w-[75px]">{'Required:'}</Label>
      <Checkbox checked={required} onCheckedChange={(checked) => onChange(checked === true)} />
      <span className="ml-0.5 text-muted-foreground">
        {'(specifies if this field is optional or always required)'}
      </span>
    </div>
  );
}

function StandardFieldCardBody({
  field,
  depth,
  availableTypes,
  borderColor,
  bgColor,
  onChange,
  onRemove,
  usedByFormSlugs,
}: {
  field: OutputSchemaField;
  depth: number;
  availableTypes: OutputSchemaFieldType[];
  borderColor: string;
  bgColor: string;
  onChange: (updates: Partial<OutputSchemaField>) => void;
  onRemove: () => void;
  usedByFormSlugs: string[] | undefined;
}) {
  return (
    <div className={`group flex flex-col border-l-3 ${borderColor} ${bgColor} rounded-r py-0.5 pl-3`}>
      <FieldHeader field={field} availableTypes={availableTypes} onChange={onChange} onRemove={onRemove} />
      {usedByFormSlugs !== undefined && <FieldUsageWarning slugs={usedByFormSlugs} />}
      {field.type === 'enum' && (
        <div className="flex items-center gap-1 min-h-7 pt-1">
          <Label className="shrink-0 w-[75px]">{'Values:'}</Label>
          <EnumValuesEditor
            values={field.enumValues ?? ['']}
            onChange={(v) => onChange({ enumValues: v })}
          />
        </div>
      )}
      <FieldDescriptionRow
        description={field.description}
        onChange={(description) => onChange({ description })}
      />
      <FieldRequiredRow required={field.required} onChange={(required) => onChange({ required })} />
      <FieldChildren field={field} depth={depth} onChange={onChange} />
    </div>
  );
}

export function OutputSchemaFieldCard({
  field,
  depth,
  onChange,
  onRemove,
  isArrayItem,
  usedByFormSlugs,
}: FieldCardProps) {
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
    <StandardFieldCardBody
      field={field}
      depth={depth}
      availableTypes={availableTypes}
      borderColor={borderColor}
      bgColor={bgColor}
      onChange={handleChange}
      onRemove={onRemove}
      usedByFormSlugs={usedByFormSlugs}
    />
  );
}
