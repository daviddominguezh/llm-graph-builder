'use client';

import { Separator } from '@/components/ui/separator';
import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface SchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  required?: boolean;
}

export interface ToolSchema {
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

function buildRequiredSet(schema: ToolSchema): Set<string> {
  const required = new Set<string>();
  if (Array.isArray(schema.required)) {
    for (const name of schema.required) required.add(name);
  }
  if (schema.properties) {
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (prop.required === true) required.add(name);
    }
  }
  return required;
}

function SchemaFieldRow({
  name,
  prop,
  isRequired,
}: {
  name: string;
  prop: SchemaProperty;
  isRequired: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex min-w-0 items-baseline gap-1">
        <code className="shrink-0 font-mono text-[11px] font-semibold">{name}</code>
        {prop.type && <span className="text-[10px] text-muted-foreground">({prop.type})</span>}
        {isRequired && <span className="text-[10px] font-medium text-orange-600">*</span>}
      </div>
      {prop.description && (
        <span className="text-[10px] leading-tight text-muted-foreground">{prop.description}</span>
      )}
      {prop.enum && prop.enum.length > 0 && (
        <div className="flex flex-wrap gap-0.5">
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

function ToolSchemaDetails({ schema }: { schema: ToolSchema }) {
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    return <p className="px-3 py-1 text-[10px] text-muted-foreground">No parameters</p>;
  }

  const requiredSet = buildRequiredSet(schema);
  const entries = Object.entries(schema.properties);
  const cmp = (a: [string, SchemaProperty], b: [string, SchemaProperty]) => a[0].localeCompare(b[0]);
  const required = entries.filter(([n]) => requiredSet.has(n)).sort(cmp);
  const optional = entries.filter(([n]) => !requiredSet.has(n)).sort(cmp);
  const sorted = [...required, ...optional];

  return (
    <div className="flex flex-col px-3 pb-2">
      {sorted.map(([name, prop], index) => (
        <div key={name}>
          {index > 0 && <Separator className="my-1.5" />}
          <SchemaFieldRow name={name} prop={prop} isRequired={requiredSet.has(name)} />
        </div>
      ))}
    </div>
  );
}

export function FloatingSchema({
  description = '',
  anchorRef,
  schema,
  onClose,
}: {
  description?: string;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  schema: ToolSchema;
  onClose?: () => void;
}) {
  const floatingRef = useRef<HTMLDivElement | null>(null);

  const positionRef = useCallback(
    (el: HTMLDivElement | null) => {
      floatingRef.current = el;
      const anchor = anchorRef.current;
      if (!el || !anchor) return;
      const rect = anchor.getBoundingClientRect();
      el.style.top = `${String(rect.bottom + 4)}px`;
      el.style.left = `${String(rect.left)}px`;
      el.style.width = `${String(rect.width)}px`;
    },
    [anchorRef]
  );

  useEffect(() => {
    if (onClose === undefined) return;
    const handler = (e: MouseEvent) => {
      const el = floatingRef.current;
      const anchor = anchorRef.current;
      if (el?.contains(e.target as Node) === true) return;
      if (anchor?.contains(e.target as Node) === true) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  return createPortal(
    <div
      ref={positionRef}
      data-tools-panel-portal
      className="fixed z-50 max-h-64 overflow-y-auto rounded-md border bg-background shadow-lg py-1.5"
    >
      {description.length > 0 && (
        <>
          <div className="px-3 mt-1 text-[10px] mb-2">
            <div className="mt-0.5 text-muted-foreground mb-2">{description}</div>
            <Separator />
          </div>
        </>
      )}

      <ToolSchemaDetails schema={schema} />
    </div>,
    document.body
  );
}
