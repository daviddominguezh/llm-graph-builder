'use client';

import type { OutputSchemaEntity } from '@daviddh/graph-types';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { deleteFormAction, listFormsAction } from '@/app/actions/forms';

import { FormDeleteConfirm } from './FormDeleteConfirm';
import { FormDialog } from './FormDialog';
import { FormsEmptyState } from './FormsEmptyState';
import { FormsList } from './FormsList';

interface FormRow {
  id: string;
  slug: string;
  displayName: string;
  schemaId: string;
}

type DialogState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; formId: string }
  | { kind: 'delete'; formId: string; slug: string };

interface Props {
  agentId: string;
  schemas: OutputSchemaEntity[];
  onOpenSchemaDialog: () => void;
}

export function FormsSection({ agentId, schemas, onOpenSchemaDialog }: Props): ReactElement {
  const t = useTranslations('forms.section');
  const [forms, setForms] = useState<FormRow[] | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' });

  const refresh = useCallback(() => {
    let cancelled = false;
    listFormsAction(agentId)
      .then((rows) => {
        if (!cancelled) setForms(rows);
      })
      .catch(() => undefined);
    return (): void => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(() => refresh(), [refresh]);

  const closeDialogAndRefresh = (): void => {
    setDialog({ kind: 'closed' });
    refresh();
  };

  const onDeleteRequest = (id: string): void => {
    if (forms === null) return;
    const row = forms.find((f) => f.id === id);
    if (!row) return;
    setDialog({ kind: 'delete', formId: id, slug: row.slug });
  };

  const confirmDelete = async (): Promise<void> => {
    if (dialog.kind !== 'delete') return;
    await deleteFormAction(dialog.formId);
    await refresh();
  };

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title={t('title')} description={t('description')} />
      <SectionBody
        forms={forms}
        schemas={schemas}
        onCreate={() => setDialog({ kind: 'create' })}
        onCreateSchema={onOpenSchemaDialog}
        onEdit={(id) => setDialog({ kind: 'edit', formId: id })}
        onDelete={onDeleteRequest}
      />
      {(dialog.kind === 'create' || dialog.kind === 'edit') && (
        <FormDialog
          open
          agentId={agentId}
          schemas={schemas}
          onClose={closeDialogAndRefresh}
          mode={dialog.kind === 'create' ? { mode: 'create' } : { mode: 'edit', formId: dialog.formId }}
        />
      )}
      {dialog.kind === 'delete' && (
        <FormDeleteConfirm
          open
          slug={dialog.slug}
          onClose={() => setDialog({ kind: 'closed' })}
          onConfirm={confirmDelete}
        />
      )}
    </section>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }): ReactElement {
  return (
    <header className="flex flex-col">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="text-xs text-muted-foreground">{description}</p>
    </header>
  );
}

interface BodyProps {
  forms: FormRow[] | null;
  schemas: OutputSchemaEntity[];
  onCreate: () => void;
  onCreateSchema: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function SectionBody({ forms, schemas, onCreate, onCreateSchema, onEdit, onDelete }: BodyProps): ReactElement {
  if (forms === null) return <SkeletonList />;
  if (schemas.length === 0) return <FormsEmptyState mode="no-schemas" onCreateSchema={onCreateSchema} />;
  if (forms.length === 0) return <FormsEmptyState mode="no-forms" onCreateForm={onCreate} />;
  return <FormsList forms={forms} onEdit={onEdit} onDelete={onDelete} />;
}

function SkeletonList(): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <div className="h-8 animate-pulse rounded-md bg-muted/50" />
      <div className="h-8 animate-pulse rounded-md bg-muted/50" />
      <div className="h-8 animate-pulse rounded-md bg-muted/50" />
    </div>
  );
}
