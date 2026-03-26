'use client';

import { X, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface HeaderEntry {
  key: string;
  value: string;
}

export function headersToEntries(headers: Record<string, string> | undefined): HeaderEntry[] {
  if (headers === undefined) return [];
  return Object.entries(headers).map(([key, value]) => ({ key, value }));
}

export function entriesToHeaders(entries: HeaderEntry[]): Record<string, string> | undefined {
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map((e) => [e.key, e.value]));
}

function HeaderRow({
  entry,
  onChange,
  onRemove,
}: {
  entry: HeaderEntry;
  onChange: (e: HeaderEntry) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Input
        value={entry.key}
        onChange={(e) => onChange({ ...entry, key: e.target.value })}
        placeholder="Header name"
        className="flex-1"
      />
      <Input
        value={entry.value}
        onChange={(e) => onChange({ ...entry, value: e.target.value })}
        placeholder="Value"
        className="flex-1"
      />
      <Button variant="ghost" size="icon-xs" onClick={onRemove}>
        <X className="size-3" />
      </Button>
    </div>
  );
}

export function HeadersEditor({
  headers,
  onHeadersChange,
}: {
  headers: Record<string, string> | undefined;
  onHeadersChange: (h: Record<string, string> | undefined) => void;
}) {
  const entries = headersToEntries(headers);

  function updateEntry(index: number, updated: HeaderEntry): void {
    const next = entries.map((e, i) => (i === index ? updated : e));
    onHeadersChange(entriesToHeaders(next));
  }

  function removeEntry(index: number): void {
    const next = entries.filter((_, i) => i !== index);
    onHeadersChange(entriesToHeaders(next));
  }

  function addEntry(): void {
    onHeadersChange(entriesToHeaders([...entries, { key: '', value: '' }]));
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label>Headers</Label>
        <Button variant="ghost" size="icon-xs" onClick={addEntry}>
          <Plus className="size-3" />
        </Button>
      </div>
      {entries.length > 0 && (
        <div className="space-y-1">
          {entries.map((entry, index) => (
            <HeaderRow
              key={index}
              entry={entry}
              onChange={(e) => updateEntry(index, e)}
              onRemove={() => removeEntry(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
