'use client';

import { Check, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

import type { DiscoveredTool } from '../../lib/api';
import type { ToolFieldValue } from '../../schemas/graph.schema';
import type { FieldMode } from './FieldModeToggle';
import { FieldModeToggle } from './FieldModeToggle';

interface SchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  required?: boolean;
  properties?: Record<string, SchemaProperty>;
  items?: SchemaProperty;
}

interface ToolSchema {
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

export interface ToolParamsCardProps {
  toolName: string;
  tools: DiscoveredTool[];
  toolFields?: Record<string, ToolFieldValue>;
  onToolFieldsChange?: (toolFields: Record<string, ToolFieldValue> | undefined) => void;
  onOpenReference?: (fieldName: string) => void;
  readOnly?: boolean;
}

interface SortedProperty {
  name: string;
  prop: SchemaProperty;
  isRequired: boolean;
}

function findTool(name: string, tools: DiscoveredTool[]): DiscoveredTool | undefined {
  return tools.find((t) => t.name === name);
}

function buildRequiredSet(schema: ToolSchema): Set<string> {
  const required = new Set<string>();
  if (Array.isArray(schema.required)) {
    for (const name of schema.required) {
      required.add(name);
    }
  }
  if (schema.properties) {
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (prop.required === true) {
        required.add(name);
      }
    }
  }
  return required;
}

function getSortedProperties(schema: ToolSchema, requiredSet: Set<string>): SortedProperty[] {
  if (!schema.properties) return [];
  const entries = Object.entries(schema.properties).map(([name, prop]) => ({
    name,
    prop,
    isRequired: requiredSet.has(name),
  }));
  const requiredFields = entries.filter((e) => e.isRequired).sort((a, b) => a.name.localeCompare(b.name));
  const optionalFields = entries.filter((e) => !e.isRequired).sort((a, b) => a.name.localeCompare(b.name));
  return [...requiredFields, ...optionalFields];
}

function getFieldMode(field: ToolFieldValue | undefined): FieldMode {
  if (field === undefined) return 'inferred';
  return field.type;
}

interface ReferenceChipProps {
  name: string;
  onOpenReference?: (fieldName: string) => void;
  t: (key: string) => string;
}

function ReferenceChip({ name, onOpenReference, t }: ReferenceChipProps) {
  return (
    <div className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-[10px] text-blue-700">
      <Check className="size-3" />
      <span>{t('referencesSet')}</span>
      <Button variant="ghost" size="icon-xs" onClick={() => onOpenReference?.(name)}>
        <Pencil className="size-2.5" />
      </Button>
    </div>
  );
}

interface FieldRowProps {
  entry: SortedProperty;
  fieldValue: ToolFieldValue | undefined;
  onModeChange: (name: string, mode: FieldMode) => void;
  onValueChange: (name: string, value: string) => void;
  onOpenReference?: (fieldName: string) => void;
  readOnly: boolean;
  t: (key: string) => string;
}

function PropertyRowHeader({ name, prop, isRequired, t }: { name: string; prop: SchemaProperty; isRequired: boolean; t: (key: string) => string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1">
      <code className="shrink-0 font-mono text-[11px] font-semibold">{name}</code>
      {prop.type && <span className="text-[10px] text-muted-foreground">({prop.type})</span>}
      {isRequired
        ? <span className="text-[10px] font-medium text-orange-600">*</span>
        : <span className="text-[10px] italic text-muted-foreground/60">{t('optionalField')}</span>}
    </div>
  );
}

function PropertyRowBody({ entry, fieldValue, onModeChange, onValueChange, onOpenReference, readOnly, t }: FieldRowProps) {
  const { name, prop } = entry;
  const mode = getFieldMode(fieldValue);

  return (
    <>
      <FieldModeToggle
        mode={mode}
        onModeChange={(m) => onModeChange(name, m)}
        fieldName={name}
        readOnly={readOnly}
      />
      {prop.enum && prop.enum.length > 0 && (
        <div className="flex flex-wrap gap-0.5">
          {prop.enum.map((v) => (
            <span key={v} className="rounded bg-muted px-1 py-0.5 font-mono text-[9px]">{v}</span>
          ))}
        </div>
      )}
      {mode === 'fixed' && fieldValue?.type === 'fixed' && (
        <Input
          value={fieldValue.value}
          onChange={(e) => onValueChange(name, e.target.value)}
          placeholder={t('fixedValuePlaceholder')}
          className="h-6 text-[11px]"
          readOnly={readOnly}
        />
      )}
      {mode === 'reference' && (
        <ReferenceChip name={name} onOpenReference={onOpenReference} t={t} />
      )}
    </>
  );
}

function PropertyRow({ entry, fieldValue, onModeChange, onValueChange, onOpenReference, readOnly, t }: FieldRowProps) {
  const { name, prop, isRequired } = entry;

  return (
    <div className="flex flex-col gap-1">
      <PropertyRowHeader name={name} prop={prop} isRequired={isRequired} t={t} />
      {prop.description && (
        <span className="text-[10px] leading-tight text-muted-foreground">{prop.description}</span>
      )}
      <PropertyRowBody
        entry={entry}
        fieldValue={fieldValue}
        onModeChange={onModeChange}
        onValueChange={onValueChange}
        onOpenReference={onOpenReference}
        readOnly={readOnly}
        t={t}
      />
    </div>
  );
}

interface ModeChangeParams {
  fieldName: string;
  mode: FieldMode;
  toolFields: Record<string, ToolFieldValue> | undefined;
  onToolFieldsChange: (toolFields: Record<string, ToolFieldValue> | undefined) => void;
  onOpenReference?: (fieldName: string) => void;
}

function applyModeChange({ fieldName, mode, toolFields, onToolFieldsChange, onOpenReference }: ModeChangeParams) {
  const current = toolFields ?? {};
  if (mode === 'inferred') {
    const rest = Object.fromEntries(Object.entries(current).filter(([k]) => k !== fieldName));
    onToolFieldsChange(Object.keys(rest).length > 0 ? rest : undefined);
  } else if (mode === 'fixed') {
    onToolFieldsChange({ ...current, [fieldName]: { type: 'fixed', value: '' } });
  } else {
    onOpenReference?.(fieldName);
  }
}

export function ToolParamsCard({
  toolName,
  tools,
  toolFields,
  onToolFieldsChange,
  onOpenReference,
  readOnly = false,
}: ToolParamsCardProps) {
  const t = useTranslations('edgePanel');
  const tool = findTool(toolName, tools);

  if (!tool?.inputSchema) return null;

  const schema = tool.inputSchema as ToolSchema;
  if (!schema.properties || Object.keys(schema.properties).length === 0) return null;

  const requiredSet = buildRequiredSet(schema);
  const sorted = getSortedProperties(schema, requiredSet);

  const handleModeChange = (fieldName: string, mode: FieldMode) => {
    if (!onToolFieldsChange) return;
    applyModeChange({ fieldName, mode, toolFields, onToolFieldsChange, onOpenReference });
  };

  const handleValueChange = (fieldName: string, value: string) => {
    if (!onToolFieldsChange) return;
    const current = toolFields ?? {};
    onToolFieldsChange({ ...current, [fieldName]: { type: 'fixed', value } });
  };

  return (
    <div className="mt-2 rounded border bg-muted/30 p-2 text-xs">
      {tool.description && (
        <p className="mb-1.5 text-[10px] leading-tight text-muted-foreground italic">{tool.description}</p>
      )}
      <div className="mb-1 text-[10px] font-medium text-muted-foreground">{t('parameters')}</div>
      <div className="flex flex-col">
        {sorted.map((entry, index) => (
          <div key={entry.name}>
            {index > 0 && <Separator className="my-2" />}
            <PropertyRow
              entry={entry}
              fieldValue={toolFields?.[entry.name]}
              onModeChange={handleModeChange}
              onValueChange={handleValueChange}
              onOpenReference={onOpenReference}
              readOnly={readOnly}
              t={t}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
