'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { OutputSchemaField } from '@daviddh/graph-types';
import { Braces, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { OutputSchemaFieldCard } from './OutputSchemaFieldCard';
import { createEmptyField, removeFieldFromList, updateFieldInList } from './outputSchemaTypes';

interface OutputSchemaDialogProps {
  fields: OutputSchemaField[];
  onChange: (fields: OutputSchemaField[]) => void;
}

function EmptyState() {
  const t = useTranslations('nodePanel');
  return <p className="py-8 text-center text-xs text-muted-foreground">{t('outputSchemaEmpty')}</p>;
}

function FieldList({
  fields,
  onChange,
}: {
  fields: OutputSchemaField[];
  onChange: (fields: OutputSchemaField[]) => void;
}) {
  return (
    <div className="space-y-3">
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

export function OutputSchemaDialog({ fields, onChange }: OutputSchemaDialogProps) {
  const t = useTranslations('nodePanel');
  const fieldCount = fields.length;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" title={t('outputSchema')}>
            <Braces className="h-4 w-4" />
            {fieldCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">
                {fieldCount}
              </span>
            )}
          </Button>
        }
      />
      <DialogContent className="flex h-[80vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('outputSchema')}</DialogTitle>
          <DialogDescription>{t('outputSchemaDescription')}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto py-2">
          {fields.length === 0 ? <EmptyState /> : <FieldList fields={fields} onChange={onChange} />}
        </div>
        <DialogFooter showCloseButton>
          <Button variant="outline" onClick={() => onChange([...fields, createEmptyField()])}>
            <Plus className="mr-1 h-4 w-4" />
            {t('addField')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
