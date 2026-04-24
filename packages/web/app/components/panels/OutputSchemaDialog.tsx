'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OutputSchemaEntity, OutputSchemaField } from '@daviddh/graph-types';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { OutputSchemaFieldCard } from './OutputSchemaFieldCard';
import {
  createEmptyField,
  isSchemaComplete,
  removeFieldFromList,
  updateFieldInList,
} from './outputSchemaTypes';

interface OutputSchemaDialogProps {
  schema: OutputSchemaEntity | undefined;
  onSave: (id: string, updates: Partial<OutputSchemaEntity>) => void;
  onSaved?: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EmptyState() {
  const t = useTranslations('nodePanel');
  return (
    <p className="p-4 rounded-md text-center text-xs text-muted-foreground bg-muted -mt-2 mx-1">
      {t('outputSchemaEmpty')}
    </p>
  );
}

function FieldList({
  fields,
  onChange,
}: {
  fields: OutputSchemaField[];
  onChange: (fields: OutputSchemaField[]) => void;
}) {
  return (
    <div className="flex flex-col ml-1">
      <Label>{'Fields:'}</Label>
      <div className="flex flex-col gap-3 space-y-1 pr-1 mt-2 pl-0">
        {fields.map((field, index) => (
          <OutputSchemaFieldCard
            key={index}
            field={field}
            depth={1}
            onChange={(updated) => onChange(updateFieldInList(fields, index, updated))}
            onRemove={() => onChange(removeFieldFromList(fields, index))}
          />
        ))}
      </div>
    </div>
  );
}

function SchemaEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: OutputSchemaEntity;
  onSave: (id: string, updates: Partial<OutputSchemaEntity>) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('nodePanel');
  const tSchemas = useTranslations('outputSchemas');
  const [draft, setDraft] = useState<OutputSchemaEntity>(initial);

  const handleFieldsChange = (fields: OutputSchemaField[]) => {
    setDraft((prev) => ({ ...prev, fields }));
  };

  const handleSave = () => {
    onSave(initial.id, { name: draft.name, fields: draft.fields });
  };

  return (
    <>
      <div className="flex flex-col flex-1 overflow-y-auto">
        <DialogHeader className="border-b pb-3 sticky top-0 bg-background! z-50">
          <DialogTitle>{'Structured Output Schema'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 px-1 pt-3 pb-3">
          <Label className="text-xs">{tSchemas('schemaName')}</Label>
          <Input
            value={draft.name}
            onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
            placeholder={tSchemas('schemaName')}
            className="h-7 font-mono text-xs"
          />
        </div>
        <div className="py-2">
          {draft.fields.length === 0 ? (
            <EmptyState />
          ) : (
            <FieldList fields={draft.fields} onChange={handleFieldsChange} />
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleFieldsChange([...draft.fields, createEmptyField()])}
          className="w-fit self-end rounded-md"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('addField')}
        </Button>
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" className="rounded-md" onClick={onCancel} />}>
          {tSchemas('cancel')}
        </DialogClose>
        <Button onClick={handleSave} disabled={!isSchemaComplete(draft.name, draft.fields)}>
          {tSchemas('save')}
        </Button>
      </DialogFooter>
    </>
  );
}

export function OutputSchemaDialog({ schema, onSave, onSaved, open, onOpenChange }: OutputSchemaDialogProps) {
  const handleSave = (id: string, updates: Partial<OutputSchemaEntity>) => {
    onSave(id, updates);
    onSaved?.(id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] flex-col sm:max-w-2xl" showCloseButton={false}>
        {schema && (
          <SchemaEditor
            key={schema.id}
            initial={schema}
            onSave={handleSave}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
