'use client';

import { useTranslations } from 'next-intl';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

import type { DiscoveredTool } from '../../lib/api';
import type { ToolFieldValue } from '../../schemas/graph.schema';

interface SchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  required?: boolean;
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

interface FieldRowProps {
  entry: SortedProperty;
  fieldValue: ToolFieldValue | undefined;
  onToggle: (name: string) => void;
  onValueChange: (name: string, value: string) => void;
  readOnly: boolean;
  t: (key: string) => string;
}

function AgentInferredCheckbox({ isFixed, onToggle, readOnly, fieldName, t }: {
  isFixed: boolean;
  onToggle: () => void;
  readOnly: boolean;
  fieldName: string;
  t: (key: string) => string;
}) {
  if (readOnly) return null;
  const id = `agent-inferred-${fieldName}`;
  return (
    <div className="flex items-center gap-1.5">
      <Checkbox id={id} checked={!isFixed} onCheckedChange={onToggle} className="size-3" />
      <Label htmlFor={id} className="text-[10px] text-muted-foreground font-normal cursor-pointer">
        {t('agentInferred')}
      </Label>
    </div>
  );
}

function PropertyRow({ entry, fieldValue, onToggle, onValueChange, readOnly, t }: FieldRowProps) {
  const { name, prop, isRequired } = entry;
  const isFixed = fieldValue?.type === 'fixed';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-0 items-baseline gap-1">
        <code className="shrink-0 font-mono text-[11px] font-semibold">{name}</code>
        {prop.type && <span className="text-[10px] text-muted-foreground">({prop.type})</span>}
        {isRequired
          ? <span className="text-[10px] font-medium text-orange-600">*</span>
          : <span className="text-[10px] italic text-muted-foreground/60">{t('optionalField')}</span>}
      </div>
      {prop.description && (
        <span className="text-[10px] leading-tight text-muted-foreground">{prop.description}</span>
      )}
      <AgentInferredCheckbox
        isFixed={isFixed}
        onToggle={() => onToggle(name)}
        readOnly={readOnly}
        fieldName={name}
        t={t}
      />
      {prop.enum && prop.enum.length > 0 && (
        <div className="flex flex-wrap gap-0.5">
          {prop.enum.map((v) => (
            <span key={v} className="rounded bg-muted px-1 py-0.5 font-mono text-[9px]">{v}</span>
          ))}
        </div>
      )}
      {isFixed && (
        <Input
          value={fieldValue.value}
          onChange={(e) => onValueChange(name, e.target.value)}
          placeholder={t('fixedValuePlaceholder')}
          className="h-6 text-[11px]"
          readOnly={readOnly}
        />
      )}
    </div>
  );
}

export function ToolParamsCard({ toolName, tools, toolFields, onToolFieldsChange, readOnly = false }: ToolParamsCardProps) {
  const t = useTranslations('edgePanel');
  const tool = findTool(toolName, tools);

  if (!tool?.inputSchema) return null;

  const schema = tool.inputSchema as ToolSchema;
  if (!schema.properties || Object.keys(schema.properties).length === 0) return null;

  const requiredSet = buildRequiredSet(schema);
  const sorted = getSortedProperties(schema, requiredSet);

  const handleToggle = (fieldName: string) => {
    if (!onToolFieldsChange) return;
    const current = toolFields ?? {};
    if (current[fieldName]?.type === 'fixed') {
      const rest = Object.fromEntries(Object.entries(current).filter(([k]) => k !== fieldName));
      onToolFieldsChange(Object.keys(rest).length > 0 ? rest : undefined);
    } else {
      onToolFieldsChange({ ...current, [fieldName]: { type: 'fixed', value: '' } });
    }
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
              onToggle={handleToggle}
              onValueChange={handleValueChange}
              readOnly={readOnly}
              t={t}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
