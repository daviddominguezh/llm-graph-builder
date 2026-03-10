'use client';

import { useTranslations } from 'next-intl';

import type { DiscoveredTool } from '../../lib/api';

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

interface ToolParamsCardProps {
  toolName: string;
  tools: DiscoveredTool[];
}

function findTool(name: string, tools: DiscoveredTool[]): DiscoveredTool | undefined {
  return tools.find((t) => t.name === name);
}

function buildRequiredSet(schema: ToolSchema): Set<string> {
  const required = new Set<string>();

  // Standard JSON Schema: required array at top level
  if (Array.isArray(schema.required)) {
    for (const name of schema.required) {
      required.add(name);
    }
  }

  // Fallback: property-level required: true
  if (schema.properties) {
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (prop.required === true) {
        required.add(name);
      }
    }
  }

  return required;
}

interface SortedProperty {
  name: string;
  prop: SchemaProperty;
  isRequired: boolean;
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

function PropertyRow({ name, prop, isRequired }: SortedProperty) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-1.5">
        <code className="font-mono text-[11px] font-semibold">{name}</code>
        {prop.type && <span className="text-[10px] text-muted-foreground">({prop.type})</span>}
        {isRequired
          ? <span className="text-[10px] font-medium text-orange-600">*</span>
          : <span className="text-[10px] italic text-muted-foreground/60">optional</span>}
      </div>
      {prop.description && (
        <span className="text-[10px] leading-tight text-muted-foreground">{prop.description}</span>
      )}
      {prop.enum && prop.enum.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-0.5">
          {prop.enum.map((v) => (
            <span key={v} className="rounded bg-muted px-1 py-0.5 font-mono text-[9px]">
              {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ToolParamsCard({ toolName, tools }: ToolParamsCardProps) {
  const t = useTranslations('edgePanel');
  const tool = findTool(toolName, tools);

  if (!tool?.inputSchema) return null;

  const schema = tool.inputSchema as ToolSchema;
  const properties = schema.properties;

  if (!properties || Object.keys(properties).length === 0) return null;

  const requiredSet = buildRequiredSet(schema);
  const sorted = getSortedProperties(schema, requiredSet);

  return (
    <div className="mt-2 rounded border bg-muted/30 p-2 text-xs">
      {tool.description && (
        <p className="mb-1.5 text-[10px] leading-tight text-muted-foreground italic">{tool.description}</p>
      )}
      <div className="mb-1 text-[10px] font-medium text-muted-foreground">{t('parameters')}</div>
      <div className="flex flex-col gap-1.5">
        {sorted.map((entry) => (
          <PropertyRow key={entry.name} {...entry} />
        ))}
      </div>
    </div>
  );
}
