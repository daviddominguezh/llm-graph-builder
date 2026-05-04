'use client';

import type { OutputSchemaField } from '@daviddh/graph-types';
import type { ValidationRule, ValidationsMap } from '@daviddh/llm-graph-runner';
import { useTranslations } from 'next-intl';
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { FormValidationGroup } from './FormValidationGroup';
import { FormValidationRow } from './FormValidationRow';

type LeafType = 'string' | 'number' | 'enum' | 'boolean' | 'object' | 'array';
type FilterMode = 'all' | 'configured' | 'unconfigured';

interface LeafInfo {
  path: string;
  type: LeafType;
}

interface Props {
  schema: OutputSchemaField[];
  validations: ValidationsMap;
  onChange: (next: ValidationsMap) => void;
}

export function FormDialogValidationsEditor({ schema, validations, onChange }: Props): ReactElement {
  const t = useTranslations('forms.validations');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');

  const leafPaths = useMemo(() => flattenLeafPaths(schema), [schema]);
  const configuredCount = countConfigured(leafPaths, validations);

  const updateRule = (path: string, rule: ValidationRule | null): void => {
    const next = { ...validations };
    if (rule === null) delete next[path];
    else next[path] = rule;
    onChange(next);
  };

  const passFilter = (path: string): boolean =>
    matchesQuery(path, query) && matchesFilter(path, filter, validations);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {t('countProgress', { configured: configuredCount, total: leafPaths.length })}
      </p>
      <Input
        placeholder={t('search.placeholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-7 text-xs"
      />
      <FilterButtons filter={filter} setFilter={setFilter} t={t} />
      <div className="flex flex-col">
        {renderTree({
          fields: schema,
          prefix: '',
          depth: 0,
          leafPaths,
          validations,
          onChange: updateRule,
          passFilter,
        })}
      </div>
    </div>
  );
}

interface FilterButtonsProps {
  filter: FilterMode;
  setFilter: (m: FilterMode) => void;
  t: ReturnType<typeof useTranslations>;
}

function FilterButtons({ filter, setFilter, t }: FilterButtonsProps): ReactElement {
  return (
    <div className="flex gap-1">
      <FilterButton active={filter === 'all'} onClick={() => setFilter('all')} label={t('filter.all')} />
      <FilterButton
        active={filter === 'configured'}
        onClick={() => setFilter('configured')}
        label={t('filter.configured')}
      />
      <FilterButton
        active={filter === 'unconfigured'}
        onClick={() => setFilter('unconfigured')}
        label={t('filter.unconfigured')}
      />
    </div>
  );
}

interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

function FilterButton({ active, onClick, label }: FilterButtonProps): ReactElement {
  return (
    <Button
      variant={active ? 'default' : 'outline'}
      size="sm"
      className="h-6 text-[10px]"
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

function matchesQuery(path: string, query: string): boolean {
  return query === '' || path.toLowerCase().includes(query.toLowerCase());
}

function matchesFilter(path: string, filter: FilterMode, validations: ValidationsMap): boolean {
  if (filter === 'all') return true;
  const isConfigured = validations[path] !== undefined;
  return filter === 'configured' ? isConfigured : !isConfigured;
}

function countConfigured(leafPaths: LeafInfo[], validations: ValidationsMap): number {
  return leafPaths.filter((l) => validations[l.path] !== undefined).length;
}

function flattenLeafPaths(fields: OutputSchemaField[]): LeafInfo[] {
  const out: LeafInfo[] = [];
  for (const f of fields) walkLeaves(f, f.name, out);
  return out;
}

function walkLeaves(field: OutputSchemaField, path: string, out: LeafInfo[]): void {
  if (field.type === 'object' && field.properties) {
    for (const p of field.properties) walkLeaves(p, `${path}.${p.name}`, out);
    return;
  }
  if (field.type === 'array' && field.items) {
    walkLeaves(field.items, `${path}[]`, out);
    return;
  }
  out.push({ path, type: field.type as LeafType });
}

interface RenderTreeArgs {
  fields: OutputSchemaField[];
  prefix: string;
  depth: number;
  leafPaths: LeafInfo[];
  validations: ValidationsMap;
  onChange: (path: string, rule: ValidationRule | null) => void;
  passFilter: (path: string) => boolean;
}

function renderTree(args: RenderTreeArgs): ReactNode[] {
  const out: ReactNode[] = [];
  for (const f of args.fields) {
    const thisPath = args.prefix === '' ? f.name : `${args.prefix}.${f.name}`;
    out.push(...renderField(f, thisPath, args));
  }
  return out;
}

function renderField(f: OutputSchemaField, thisPath: string, args: RenderTreeArgs): ReactNode[] {
  if (f.type === 'object' && f.properties) {
    return [renderObjectGroup(f, thisPath, args)];
  }
  if (f.type === 'array' && f.items) {
    return [renderArrayGroup(f, thisPath, args)];
  }
  if (!args.passFilter(thisPath)) return [];
  return [
    <FormValidationRow
      key={thisPath}
      path={thisPath}
      type={f.type as LeafType}
      rule={args.validations[thisPath] ?? null}
      indent={args.depth}
      onChange={(r) => args.onChange(thisPath, r)}
    />,
  ];
}

function renderObjectGroup(f: OutputSchemaField, thisPath: string, args: RenderTreeArgs): ReactNode {
  const subPaths = args.leafPaths.filter((l) => l.path.startsWith(`${thisPath}.`));
  return (
    <FormValidationGroup
      key={thisPath}
      path={thisPath}
      kind="object"
      indent={args.depth}
      configuredCount={subPaths.filter((l) => args.validations[l.path] !== undefined).length}
      totalCount={subPaths.length}
    >
      {renderTree({ ...args, fields: f.properties ?? [], prefix: thisPath, depth: args.depth + 1 })}
    </FormValidationGroup>
  );
}

function renderArrayGroup(f: OutputSchemaField, thisPath: string, args: RenderTreeArgs): ReactNode {
  const subPaths = args.leafPaths.filter((l) => l.path.startsWith(`${thisPath}[]`));
  return (
    <FormValidationGroup
      key={thisPath}
      path={thisPath}
      kind="array"
      indent={args.depth}
      configuredCount={subPaths.filter((l) => args.validations[l.path] !== undefined).length}
      totalCount={subPaths.length}
    >
      {renderTree({
        ...args,
        fields: [f.items as OutputSchemaField],
        prefix: `${thisPath}[]`,
        depth: args.depth + 1,
      })}
    </FormValidationGroup>
  );
}
