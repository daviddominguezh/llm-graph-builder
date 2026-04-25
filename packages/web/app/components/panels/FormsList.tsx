'use client';

import { Pencil, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface FormRow {
  id: string;
  slug: string;
  displayName: string;
  schemaId: string;
}

interface Props {
  forms: FormRow[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function FormsList({ forms, onEdit, onDelete }: Props): JSX.Element {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-md border">
      {forms.map((f) => (
        <FormsListRow
          key={f.id}
          form={f}
          onEdit={() => onEdit(f.id)}
          onDelete={() => onDelete(f.id)}
        />
      ))}
    </ul>
  );
}

interface RowProps {
  form: FormRow;
  onEdit: () => void;
  onDelete: () => void;
}

function FormsListRow({ form, onEdit, onDelete }: RowProps): JSX.Element {
  return (
    <li className="flex items-center justify-between px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <code className="text-xs">{form.displayName}</code>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{form.slug}</span>
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}
