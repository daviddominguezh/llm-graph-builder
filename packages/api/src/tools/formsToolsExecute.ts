import type { FieldApplyResult, FormDefinition } from '../types/forms.js';
import type { CreateFormsToolsParams } from './formsTools.js';

export interface SetFieldsArgs {
  formSlug: string;
  fields: Array<{ fieldPath: string; fieldValue: unknown }>;
}

export interface ToolResult {
  result: unknown;
}

export async function executeSet(args: SetFieldsArgs, p: CreateFormsToolsParams): Promise<ToolResult> {
  const form = p.forms.find((f) => f.formSlug === args.formSlug);
  if (form === undefined) return notFound(args.formSlug, p.forms);
  const r = await p.services.applyFormFieldsAtomic({
    conversationId: p.conversationId,
    form,
    fields: args.fields,
  });
  if (!r.ok) return await handleFailure(r.results, form, p);
  return { result: { ok: true, applied: r.results.map(({ fieldPath }) => ({ fieldPath })) } };
}

async function handleFailure(
  results: FieldApplyResult[],
  form: FormDefinition,
  p: CreateFormsToolsParams
): Promise<ToolResult> {
  const errors = results.filter(({ status }) => status !== 'applied');
  await p.services.recordFailedAttempt(p.conversationId, form.id, {
    at: new Date().toISOString(),
    errors,
  });
  return { result: { ok: false, errors } };
}

export function notFound(
  slug: string,
  forms: FormDefinition[]
): { result: { ok: false; errors: Array<{ reason: string }> } } {
  const available = forms.map(({ formSlug }) => formSlug).join(', ');
  return {
    result: {
      ok: false,
      errors: [{ reason: `Form "${slug}" not found. Available: ${available}` }],
    },
  };
}
