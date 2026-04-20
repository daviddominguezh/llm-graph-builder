'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type {
  WhatsAppChannelConnection,
  WhatsAppTemplateVariable,
} from '@/app/lib/whatsappTemplates';
import { Button } from '@/components/ui/button';

import { createTemplateAction, type TemplateActionState } from './actions';
import { validateBodyPlaceholders } from './template-validators';
import {
  BodyField,
  CategoryField,
  ChannelConnectionField,
  DescriptionField,
  LanguageField,
  NameField,
  VariablesField,
} from './form-fields';

interface CreateTemplateFormProps {
  tenantId: string;
  orgSlug: string;
  tenantSlug: string;
  connections: WhatsAppChannelConnection[];
  onSuccess: () => void;
  onCancel: () => void;
}

type FormTranslator = ReturnType<typeof useTranslations<'whatsappTemplates'>>;
type CategoryValue = 'utility' | 'marketing' | 'authentication';
type LanguageCode = 'en' | 'en_US' | 'es' | 'es_MX' | 'pt_BR';

function SubmitButton({
  isPending,
  disabled,
  t,
}: {
  isPending: boolean;
  disabled: boolean;
  t: FormTranslator;
}) {
  return (
    <Button type="submit" size="sm" disabled={isPending || disabled} className="rounded-md gap-1.5">
      {isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {isPending ? t('create.submittingApproval') : t('create.submitForApproval')}
    </Button>
  );
}

function extractBodyPlaceholderKeys(bodyText: string): Set<string> {
  const placeholders = bodyText.match(/\{\{(?:\d+)\}\}/gv);
  if (placeholders === null) return new Set();
  return new Set(placeholders.map((p) => p.replace(/\{\{|\}\}/gv, '').trim()));
}

function validateVariablesMatch(
  bodyText: string,
  variables: WhatsAppTemplateVariable[],
  t: FormTranslator
): string[] {
  const errors: string[] = [];
  const bodyKeys = extractBodyPlaceholderKeys(bodyText);
  const variableKeys = new Set(variables.map((v) => v.key).filter((k) => k !== ''));

  for (const key of bodyKeys) {
    if (!variableKeys.has(key)) {
      errors.push(t('validation.placeholderNotUsed', { key }));
    }
  }

  for (const v of variables) {
    if (v.key !== '' && !bodyKeys.has(v.key)) {
      const label = v.name !== '' ? v.name : t('validation.unnamed');
      errors.push(t('validation.variableUnused', { key: v.key, name: label }));
    }
  }

  return errors;
}

function syncVariablesWithBody(
  prev: WhatsAppTemplateVariable[],
  bodyText: string
): WhatsAppTemplateVariable[] {
  const bodyKeys = extractBodyPlaceholderKeys(bodyText);
  const existingKeys = new Set(prev.map((v) => v.key));
  const additions: WhatsAppTemplateVariable[] = [];
  for (const key of bodyKeys) {
    if (!existingKeys.has(key)) {
      additions.push({ key, name: '', example: '', required: true });
    }
  }
  if (additions.length === 0) return prev;
  return [...prev, ...additions].sort((a, b) => Number(a.key) - Number(b.key));
}

interface FormState {
  name: string;
  body: string;
  category: CategoryValue;
  language: LanguageCode;
  connectionId: string;
  variables: WhatsAppTemplateVariable[];
  bodyError: string | null;
}

function useTemplateFormState(initialConnectionId: string, t: FormTranslator) {
  const initial: TemplateActionState = { message: '', type: 'success' };
  const [actionState, formAction, isPending] = useActionState(createTemplateAction, initial);
  const [state, setState] = useState<FormState>({
    name: '',
    body: '',
    category: 'utility',
    language: 'en',
    connectionId: initialConnectionId,
    variables: [],
    bodyError: null,
  });

  const variableErrors = useMemo(
    () =>
      state.bodyError !== null ? [] : validateVariablesMatch(state.body, state.variables, t),
    [state.body, state.variables, state.bodyError, t]
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function setBody(value: string) {
    setState((prev) => ({
      ...prev,
      body: value,
      bodyError: validateBodyPlaceholders(value),
      variables: syncVariablesWithBody(prev.variables, value),
    }));
  }

  return { state, actionState, formAction, isPending, variableErrors, update, setBody };
}

function useResultHandler(state: TemplateActionState, onSuccess: () => void, t: FormTranslator) {
  const router = useRouter();

  useEffect(() => {
    if (state.message === '') return;
    if (state.type === 'error') {
      toast.error(state.message);
      return;
    }
    toast.success(t('toasts.createSuccess'));
    router.refresh();
    onSuccess();
  }, [state, router, onSuccess, t]);
}

function ApprovalNote({ t }: { t: FormTranslator }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed">
      <span
        aria-hidden="true"
        className="mt-[3px] inline-block size-1.5 shrink-0 rounded-full bg-amber-500"
      />
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{t('create.approvalNoteTitle')}</span>{' '}
        {t('create.approvalNoteBody')}
      </p>
    </div>
  );
}

function computeSubmittable(state: FormState, variableErrors: string[]): boolean {
  if (state.name.trim() === '') return false;
  if (state.body.trim() === '') return false;
  if (state.connectionId === '') return false;
  if (state.bodyError !== null) return false;
  if (variableErrors.length > 0) return false;
  return true;
}

export function CreateTemplateForm({
  tenantId,
  orgSlug,
  tenantSlug,
  connections,
  onSuccess,
  onCancel,
}: CreateTemplateFormProps) {
  const t = useTranslations('whatsappTemplates');
  const first = connections[0];
  const initialConnectionId = first !== undefined ? first.id : '';
  const form = useTemplateFormState(initialConnectionId, t);
  useResultHandler(form.actionState, onSuccess, t);

  const isSubmittable = computeSubmittable(form.state, form.variableErrors);

  return (
    <form action={form.formAction} className="flex flex-col gap-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      <input type="hidden" name="variables" value={JSON.stringify(form.state.variables)} />

      <ChannelConnectionField
        connections={connections}
        value={form.state.connectionId}
        onChange={(v) => form.update('connectionId', v)}
      />

      <div className="flex flex-col gap-4">
        <NameField value={form.state.name} onChange={(v) => form.update('name', v)} />
        <BodyField value={form.state.body} onChange={form.setBody} error={form.state.bodyError} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CategoryField
            value={form.state.category}
            onChange={(v) => form.update('category', v)}
          />
          <LanguageField
            value={form.state.language}
            onChange={(v) => form.update('language', v)}
          />
        </div>

        <DescriptionField />
      </div>

      <VariablesField
        variables={form.state.variables}
        onChange={(v) => form.update('variables', v)}
        errors={form.variableErrors}
      />

      <ApprovalNote t={t} />

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-[0.5px] rounded-md"
          onClick={onCancel}
        >
          {t('create.cancel')}
        </Button>
        <SubmitButton isPending={form.isPending} disabled={!isSubmittable} t={t} />
      </div>
    </form>
  );
}
