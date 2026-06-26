'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';

import type { OutputSchemaField } from '@daviddh/graph-types';
import { collectFieldPaths, readFormField, type FormData } from '@daviddh/llm-graph-runner';

interface Props {
  schema: OutputSchemaField[];
  data: FormData | undefined;
}

interface FilledRow {
  path: string;
  value: string;
}

export function FormDataExpandedView({ schema, data }: Props): ReactElement {
  const t = useTranslations('forms.rightPanel');
  const [showEmpties, setShowEmpties] = useState(false);
  const { filled, empties } = partitionPaths(schema, data);

  return (
    <div className="flex flex-col gap-1 pl-3 text-xs">
      {filled.map(({ path, value }) => (
        <FilledRowView key={path} path={path} value={value} />
      ))}
      {empties.length > 0 && (
        <EmptiesToggle
          count={empties.length}
          show={showEmpties}
          onToggle={(): void => setShowEmpties(!showEmpties)}
          label={t('emptyFieldsCount', { count: empties.length })}
        />
      )}
      {showEmpties && empties.map((path) => <EmptyRow key={path} path={path} />)}
    </div>
  );
}

function partitionPaths(
  schema: OutputSchemaField[],
  data: FormData | undefined
): { filled: FilledRow[]; empties: string[] } {
  const filled: FilledRow[] = [];
  const empties: string[] = [];
  for (const path of collectFieldPaths(schema)) {
    const r = readFormField(data, path);
    if (r.ok && r.value !== undefined) filled.push({ path, value: formatValue(r.value) });
    else empties.push(path);
  }
  return { filled, empties };
}

function FilledRowView({ path, value }: { path: string; value: string }): ReactElement {
  return (
    <div className="flex gap-2">
      <code className="text-muted-foreground">{path}:</code>
      <span>{value}</span>
    </div>
  );
}

function EmptyRow({ path }: { path: string }): ReactElement {
  return (
    <div className="flex gap-2 pl-4 text-muted-foreground">
      <code>{path}:</code>
      <span>—</span>
    </div>
  );
}

interface EmptiesToggleProps {
  count: number;
  show: boolean;
  onToggle: () => void;
  label: string;
}

function EmptiesToggle({ show, onToggle, label }: EmptiesToggleProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-1 flex items-center gap-1 text-muted-foreground"
      aria-expanded={show}
    >
      {show ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
      {label}
    </button>
  );
}

function formatValue(v: unknown): string {
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}
