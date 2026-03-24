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

interface OutputSchemasSectionProps {
  schemas: OutputSchemaEntity[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

function SchemaRowActions({
  schema,
  onEdit,
  onRemove,
}: {
  schema: OutputSchemaEntity;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations('outputSchemas');

  return (
    <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
      <Button variant="ghost" size="icon-xs" onClick={onEdit} title={t('editSchema')}>
        <Pencil className="size-3" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button variant="ghost" size="icon-xs" title={t('deleteTitle')}>
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
            <AlertDialogAction variant="destructive" onClick={onRemove}>
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
  onEdit,
  onRemove,
}: {
  schema: OutputSchemaEntity;
  onEdit: () => void;
  onRemove: () => void;
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
      <SchemaRowActions schema={schema} onEdit={onEdit} onRemove={onRemove} />
    </li>
  );
}

export function OutputSchemasSection({ schemas, onAdd, onRemove, onEdit }: OutputSchemasSectionProps) {
  const t = useTranslations('outputSchemas');

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <Label>{t('sectionTitle')}</Label>
        <Button variant="ghost" size="icon-xs" onClick={onAdd}>
          <Plus className="size-3" />
        </Button>
      </div>
      {schemas.length > 0 && (
        <ul className="space-y-1">
          {schemas.map((schema) => (
            <SchemaRow
              key={schema.id}
              schema={schema}
              onEdit={() => onEdit(schema.id)}
              onRemove={() => onRemove(schema.id)}
            />
          ))}
        </ul>
      )}
      <Separator className="mt-3" />
    </div>
  );
}
