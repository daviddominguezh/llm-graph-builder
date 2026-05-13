'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type { OutputSchemaEntity } from '@daviddh/graph-types';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { OutputSchemaDeleteBlockedDialog } from './OutputSchemaDeleteBlockedDialog';
import { useSchemaUsageMap } from './useSchemaUsage';

interface FormRef {
  id: string;
  slug: string;
}

interface OutputSchemasSectionProps {
  agentId: string;
  schemas: OutputSchemaEntity[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
  editFormHref?: (formId: string) => string;
}

function SchemaRowActions({
  schema,
  formsUsing,
  onEdit,
  onRemove,
  onBlockedDelete,
}: {
  schema: OutputSchemaEntity;
  formsUsing: FormRef[];
  onEdit: () => void;
  onRemove: () => void;
  onBlockedDelete: (forms: FormRef[]) => void;
}) {
  const t = useTranslations('outputSchemas');

  const handleConfirmDelete = () => {
    if (formsUsing.length > 0) {
      onBlockedDelete(formsUsing);
      return;
    }
    onRemove();
  };

  return (
    <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
      <Button variant="ghost" size="icon-xs" onClick={onEdit} title={t('editSchema')}>
        <Pencil className="size-3" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button variant="destructive" size="icon-xs" title={t('deleteTitle')}>
              <Trash2 className="size-3" />
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDescription', { name: schema.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SchemaRow({
  schema,
  formsUsing,
  onEdit,
  onRemove,
  onBlockedDelete,
}: {
  schema: OutputSchemaEntity;
  formsUsing: FormRef[];
  onEdit: () => void;
  onRemove: () => void;
  onBlockedDelete: (forms: FormRef[]) => void;
}) {
  const t = useTranslations('outputSchemas');

  return (
    <li className="flex items-center justify-between rounded-md border px-3 py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate text-xs font-medium">{schema.name}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {t('fieldCount', { count: schema.fields.length })}
        </span>
      </div>
      <SchemaRowActions
        schema={schema}
        formsUsing={formsUsing}
        onEdit={onEdit}
        onRemove={onRemove}
        onBlockedDelete={onBlockedDelete}
      />
    </li>
  );
}

function SectionHeader({ onAdd }: { onAdd: () => void }) {
  const t = useTranslations('outputSchemas');
  return (
    <div className="flex items-start justify-between mb-1">
      <div className="flex flex-col">
        <Label>{t('sectionTitle')}</Label>
        <p className="text-xs text-muted-foreground">{t('section.description')}</p>
      </div>
      <Button variant="ghost" size="icon-xs" onClick={onAdd}>
        <Plus className="size-3" />
      </Button>
    </div>
  );
}

function SchemaList({
  schemas,
  usageMap,
  onEdit,
  onRemove,
  onBlockedDelete,
}: {
  schemas: OutputSchemaEntity[];
  usageMap: Record<string, FormRef[]>;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onBlockedDelete: (forms: FormRef[]) => void;
}) {
  return (
    <ul className="space-y-1">
      {schemas.map((schema) => (
        <SchemaRow
          key={schema.id}
          schema={schema}
          formsUsing={usageMap[schema.id] ?? []}
          onEdit={() => onEdit(schema.id)}
          onRemove={() => onRemove(schema.id)}
          onBlockedDelete={onBlockedDelete}
        />
      ))}
    </ul>
  );
}

export function OutputSchemasSection({
  agentId,
  schemas,
  onAdd,
  onRemove,
  onEdit,
  editFormHref,
}: OutputSchemasSectionProps) {
  const usageMap = useSchemaUsageMap(agentId);
  const [blockedForms, setBlockedForms] = useState<FormRef[] | null>(null);

  // TODO: when editFormHref is not provided, fall back to '#' until orgSlug/agentSlug are plumbed.
  const resolveHref = (formId: string): string =>
    editFormHref !== undefined ? editFormHref(formId) : '#';

  return (
    <div className="mb-3">
      <SectionHeader onAdd={onAdd} />
      {schemas.length > 0 && (
        <SchemaList
          schemas={schemas}
          usageMap={usageMap}
          onEdit={onEdit}
          onRemove={onRemove}
          onBlockedDelete={setBlockedForms}
        />
      )}
      <Separator className="mt-3" />
      <OutputSchemaDeleteBlockedDialog
        open={blockedForms !== null}
        onClose={() => setBlockedForms(null)}
        forms={blockedForms ?? []}
        editFormHref={resolveHref}
      />
    </div>
  );
}
