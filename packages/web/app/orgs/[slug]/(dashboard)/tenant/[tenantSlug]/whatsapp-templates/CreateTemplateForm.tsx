'use client';

import { Loader2, Send } from 'lucide-react';
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
      {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
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

function useTemplateFormState(t: FormTranslator) {
  const initial: TemplateActionState = { message: '', type: 'success' };
  const [state, formAction, isPending] = useActionState(createTemplateAction, initial);
  const [variables, setVariables] = useState<WhatsAppTemplateVariable[]>([]);
  const [bodyText, setBodyText] = useState('');
  const [bodyError, setBodyError] = useState<string | null>(null);

  const variableErrors = useMemo(
    () => (bodyError !== null ? [] : validateVariablesMatch(bodyText, variables, t)),
    [bodyText, variables, bodyError, t]
  );

  function handleBodyChange(value: string) {
    setBodyText(value);
    setBodyError(validateBodyPlaceholders(value));
  }

  return {
    state,
    formAction,
    isPending,
    variables,
    setVariables,
    bodyText,
    bodyError,
    variableErrors,
    handleBodyChange,
  };
}

function useResultHandler(
  state: TemplateActionState,
  onSuccess: () => void,
  t: FormTranslator
) {
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
    <div className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-[11px] leading-relaxed">
      <span
        aria-hidden="true"
        className="mt-0.5 inline-block size-1.5 shrink-0 rounded-full bg-amber-500"
      />
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{t('create.approvalNoteTitle')}</span>{' '}
        {t('create.approvalNoteBody')}
      </p>
    </div>
  );
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
  const form = useTemplateFormState(t);
  useResultHandler(form.state, onSuccess, t);

  const hasValidationErrors = form.bodyError !== null || form.variableErrors.length > 0;

  return (
    <form action={form.formAction} className="flex flex-col gap-5">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      <input type="hidden" name="variables" value={JSON.stringify(form.variables)} />

      <ChannelConnectionField connections={connections} />

      <div className="flex flex-col gap-4">
        <NameField />
        <BodyField
          error={form.bodyError}
          charCount={form.bodyText.length}
          onChange={form.handleBodyChange}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CategoryField />
          <LanguageField />
        </div>

        <DescriptionField />
      </div>

      <VariablesField
        variables={form.variables}
        onChange={form.setVariables}
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
        <SubmitButton isPending={form.isPending} disabled={hasValidationErrors} t={t} />
      </div>
    </form>
  );
}
