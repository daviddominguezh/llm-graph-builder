'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { OutputSchemaEntity, OutputSchemaField } from '@daviddh/graph-types';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { OutputSchemaFieldCard } from './OutputSchemaFieldCard';
import { createEmptyField, removeFieldFromList, updateFieldInList } from './outputSchemaTypes';

interface OutputSchemaDialogProps {
  schema: OutputSchemaEntity | undefined;
  onUpdate: (id: string, updates: Partial<OutputSchemaEntity>) => void;
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

export function OutputSchemaDialog({ schema, onUpdate, open, onOpenChange }: OutputSchemaDialogProps) {
  const t = useTranslations('nodePanel');
  const tSchemas = useTranslations('outputSchemas');

  if (schema === undefined) return null;

  const handleFieldsChange = (fields: OutputSchemaField[]) => {
    onUpdate(schema.id, { fields });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{schema.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 px-1">
          <Input
            value={schema.name}
            onChange={(e) => onUpdate(schema.id, { name: e.target.value })}
            placeholder={tSchemas('schemaName')}
            className="h-7 font-mono text-xs"
          />
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {schema.fields.length === 0 ? (
            <EmptyState />
          ) : (
            <FieldList fields={schema.fields} onChange={handleFieldsChange} />
          )}
        </div>
        <DialogFooter showCloseButton>
          <Button
            variant="outline"
            onClick={() => handleFieldsChange([...schema.fields, createEmptyField()])}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t('addField')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
