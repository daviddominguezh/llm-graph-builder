'use client';

import { useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type { ContextPrecondition } from '../../types/contextPrecondition';
import { ConditionBuilder } from './ConditionBuilder';

interface ContextPreconditionsSectionProps {
  preconditions: ContextPrecondition[];
  contextKeys: string[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ContextPrecondition>) => void;
}

function PreconditionHeader({ name, expanded, onToggle, onRemove }: {
  name: string;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between cursor-pointer" onClick={onToggle}>
      <span className="flex items-center gap-1.5 text-xs font-medium">
        <ChevronDown className={`size-3 transition-transform ${expanded ? '' : '-rotate-90'}`} />
        {name}
      </span>
      <div onClick={(e) => e.stopPropagation()}>
        <Button variant="destructive" size="icon-xs" onClick={onRemove}>
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}

function PreconditionItem({ precondition, contextKeys, onRemove, onUpdate }: {
  precondition: ContextPrecondition;
  contextKeys: string[];
  onRemove: () => void;
  onUpdate: (id: string, updates: Partial<ContextPrecondition>) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="rounded-md border px-3 py-2">
      <PreconditionHeader
        name={precondition.name}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        onRemove={onRemove}
      />
      {expanded && (
        <div className="mt-2 space-y-2">
          <Input
            value={precondition.name}
            onChange={(e) => onUpdate(precondition.id, { name: e.target.value })}
            placeholder="Precondition name"
          />
          <ConditionBuilder
            root={precondition.root}
            contextKeys={contextKeys}
            onChange={(root) => onUpdate(precondition.id, { root })}
          />
        </div>
      )}
    </li>
  );
}

export function ContextPreconditionsSection({
  preconditions,
  contextKeys,
  onAdd,
  onRemove,
  onUpdate,
}: ContextPreconditionsSectionProps) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <Label>Context Preconditions</Label>
        <Button variant="ghost" size="icon-xs" onClick={onAdd}>
          <Plus className="size-3" />
        </Button>
      </div>
      {preconditions.length > 0 && (
        <ul className="space-y-2">
          {preconditions.map((p) => (
            <PreconditionItem
              key={p.id}
              precondition={p}
              contextKeys={contextKeys}
              onRemove={() => onRemove(p.id)}
              onUpdate={onUpdate}
            />
          ))}
        </ul>
      )}
      <Separator className="mt-3" />
    </div>
  );
}
