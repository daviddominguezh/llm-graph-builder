'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

interface ContextPreconditionsSectionProps {
  preconditions: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  onRename: (oldValue: string, newValue: string) => void;
}

function AddForm({ onAdd, onCancel }: { onAdd: (value: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('');

  return (
    <div className="flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Precondition name"
        className="flex-1"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) {
            onAdd(value.trim());
            onCancel();
          }
          if (e.key === 'Escape') onCancel();
        }}
      />
      <Button
        variant="ghost"
        size="sm"
        disabled={!value.trim()}
        onClick={() => {
          onAdd(value.trim());
          onCancel();
        }}
      >
        Add
      </Button>
      <Button variant="ghost" size="icon-xs" onClick={onCancel}>
        <X className="size-3" />
      </Button>
    </div>
  );
}

function PreconditionRow({
  name,
  onRemove,
  onRename,
}: {
  name: string;
  onRemove: () => void;
  onRename: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="flex-1"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && editValue.trim()) {
              onRename(editValue.trim());
              setEditing(false);
            }
            if (e.key === 'Escape') {
              setEditValue(name);
              setEditing(false);
            }
          }}
        />
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            setEditValue(name);
            setEditing(false);
          }}
        >
          <X className="size-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="group/precondition flex items-center justify-between rounded px-2 py-1 hover:bg-muted/50">
      <span className="text-xs">{name}</span>
      <div className="flex gap-1 opacity-0 group-hover/precondition:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon-xs" onClick={() => setEditing(true)}>
          <Pencil className="size-3" />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onRemove}>
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}

export function ContextPreconditionsSection({
  preconditions,
  onAdd,
  onRemove,
  onRename,
}: ContextPreconditionsSectionProps) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <Label>Context Preconditions</Label>
        <Button variant="ghost" size="icon-xs" onClick={() => setAdding(true)}>
          <Plus className="size-3" />
        </Button>
      </div>
      {adding && <AddForm onAdd={onAdd} onCancel={() => setAdding(false)} />}
      {preconditions.length > 0 && (
        <div className="space-y-0.5 mt-1">
          {preconditions.map((name) => (
            <PreconditionRow
              key={name}
              name={name}
              onRemove={() => onRemove(name)}
              onRename={(newName) => onRename(name, newName)}
            />
          ))}
        </div>
      )}
      <Separator className="mt-3" />
    </div>
  );
}
