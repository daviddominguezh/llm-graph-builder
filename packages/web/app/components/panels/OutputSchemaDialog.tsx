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
import { createEmptyField, removeFieldFromList, updateFieldInList } from './outputSchemaTypes';

interface OutputSchemaDialogProps {
  schema: OutputSchemaEntity | undefined;
  onSave: (id: string, updates: Partial<OutputSchemaEntity>) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EmptyState() {
  const t = useTranslations('nodePanel');
  return (
    <p className="py-8 text-center text-xs text-muted-foreground">{t('outputSchemaEmpty')}</p>
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
    <div className="space-y-1">
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
      <div className="flex items-center justify-between">
        <DialogHeader>
          <DialogTitle>{draft.name || tSchemas('schemaName')}</DialogTitle>
        </DialogHeader>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleFieldsChange([...draft.fields, createEmptyField()])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('addField')}
        </Button>
      </div>
      <div className="space-y-1 px-1">
        <Label className="text-xs">{tSchemas('schemaName')}</Label>
        <Input
          value={draft.name}
          onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
          placeholder={tSchemas('schemaName')}
          className="h-7 font-mono text-xs"
        />
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {draft.fields.length === 0 ? (
          <EmptyState />
        ) : (
          <FieldList fields={draft.fields} onChange={handleFieldsChange} />
        )}
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" onClick={onCancel} />}>
          {tSchemas('cancel')}
        </DialogClose>
        <Button onClick={handleSave}>{tSchemas('save')}</Button>
      </DialogFooter>
    </>
  );
}

export function OutputSchemaDialog({ schema, onSave, open, onOpenChange }: OutputSchemaDialogProps) {
  const handleSave = (id: string, updates: Partial<OutputSchemaEntity>) => {
    onSave(id, updates);
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
