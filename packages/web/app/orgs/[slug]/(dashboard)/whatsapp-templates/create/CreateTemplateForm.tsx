'use client';

import { Loader2, MessageSquareDashed } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { WhatsAppChannelConnection, WhatsAppTemplateVariable } from '@/app/lib/whatsappTemplates';
import { Button } from '@/components/ui/button';

import { createTemplateAction, type TemplateActionState } from '../actions';
import { validateBodyPlaceholders } from '../template-validators';
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
  orgId: string;
  slug: string;
  connections: WhatsAppChannelConnection[];
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
      {isPending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <MessageSquareDashed className="size-3.5" />
      )}
      {isPending ? t('create.submitting') : t('create.submit')}
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

function useToastRedirect(state: TemplateActionState, slug: string, t: FormTranslator) {
  const router = useRouter();

  useEffect(() => {
    if (state.message === '') return;
    if (state.type === 'error') {
      toast.error(state.message);
    } else {
      toast.success(t('toasts.createSuccess'));
      router.push(`/orgs/${slug}/whatsapp-templates`);
    }
  }, [state, router, slug, t]);
}

export function CreateTemplateForm({ orgId, slug, connections }: CreateTemplateFormProps) {
  const t = useTranslations('whatsappTemplates');
  const form = useTemplateFormState(t);
  useToastRedirect(form.state, slug, t);

  const hasValidationErrors = form.bodyError !== null || form.variableErrors.length > 0;

  return (
    <form action={form.formAction} className="flex flex-col gap-5">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="slug" value={slug} />
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

      <p className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        {t('create.approvalNote')}
      </p>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Link href={`/orgs/${slug}/whatsapp-templates`}>
          <Button type="button" variant="outline" size="sm" className="border-[0.5px] rounded-md">
            {t('create.cancel')}
          </Button>
        </Link>
        <SubmitButton isPending={form.isPending} disabled={hasValidationErrors} t={t} />
      </div>
    </form>
  );
}
