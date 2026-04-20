'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';

import type { WhatsAppTemplateVariable } from '@/app/lib/whatsappTemplates';
import { createWhatsAppTemplate, deleteWhatsAppTemplate } from '@/app/lib/whatsappTemplates';

import { validateBodyPlaceholders } from './template-validators';

export interface TemplateActionState {
  message: string;
  type: 'success' | 'error';
}

type ActionTranslator = Awaited<ReturnType<typeof getTranslations<'whatsappTemplates'>>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isVariable(value: unknown): value is WhatsAppTemplateVariable {
  if (!isRecord(value)) return false;
  const { key, name, example, required } = value;
  return (
    typeof key === 'string' &&
    typeof name === 'string' &&
    typeof example === 'string' &&
    typeof required === 'boolean'
  );
}

function collectVariables(parsed: unknown[]): WhatsAppTemplateVariable[] | { error: 'shape' } {
  const data: WhatsAppTemplateVariable[] = [];
  for (const item of parsed) {
    if (!isVariable(item)) return { error: 'shape' };
    data.push(item);
  }
  return data;
}

type VariablesResult =
  | { data: WhatsAppTemplateVariable[] }
  | { error: 'shape' | 'notArray' | 'json' };

function parseVariablesJson(raw: string): VariablesResult {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { error: 'notArray' };
    const result = collectVariables(parsed);
    if ('error' in result) return { error: 'shape' };
    return { data: result };
  } catch {
    return { error: 'json' };
  }
}

interface CreateFields {
  orgId: string;
  slug: string;
  channelConnectionId: string;
  name: string;
  body: string;
  language: string;
  category: string;
  description: string;
  variablesRaw: string;
}

function getField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function extractCreateFields(formData: FormData): CreateFields {
  return {
    orgId: getField(formData, 'orgId'),
    slug: getField(formData, 'slug'),
    channelConnectionId: getField(formData, 'channelConnectionId'),
    name: getField(formData, 'name'),
    body: getField(formData, 'body'),
    language: getField(formData, 'language'),
    category: getField(formData, 'category'),
    description: getField(formData, 'description'),
    variablesRaw: getField(formData, 'variables'),
  };
}

function validateRequiredFields(fields: CreateFields, t: ActionTranslator): string | null {
  if (fields.orgId === '') return t('errors.missingOrg');
  if (fields.channelConnectionId === '') return t('errors.connectionRequired');
  if (fields.name === '' || fields.body === '' || fields.category === '') {
    return t('errors.fieldsRequired');
  }
  return null;
}

function isValidCategory(value: string): value is 'utility' | 'marketing' | 'authentication' {
  return value === 'utility' || value === 'marketing' || value === 'authentication';
}

function translateVariablesError(
  result: Exclude<VariablesResult, { data: WhatsAppTemplateVariable[] }>,
  t: ActionTranslator
): string {
  if (result.error === 'shape') return t('errors.invalidVariableShape');
  if (result.error === 'notArray') return t('errors.invalidVariables');
  return t('errors.invalidJson');
}

function errorState(message: string): TemplateActionState {
  return { message, type: 'error' };
}

type ValidationResult =
  | { error: TemplateActionState }
  | {
      payload: {
        category: 'utility' | 'marketing' | 'authentication';
        variables: WhatsAppTemplateVariable[];
        language: string;
        description: string | null;
      };
    };

function validateAndBuild(fields: CreateFields, t: ActionTranslator): ValidationResult {
  const requiredError = validateRequiredFields(fields, t);
  if (requiredError !== null) return { error: errorState(requiredError) };

  const placeholderError = validateBodyPlaceholders(fields.body);
  if (placeholderError !== null) return { error: errorState(placeholderError) };

  if (!isValidCategory(fields.category)) return { error: errorState(t('errors.invalidCategory')) };

  const variablesRaw = fields.variablesRaw === '' ? '[]' : fields.variablesRaw;
  const variablesResult = parseVariablesJson(variablesRaw);
  if ('error' in variablesResult) {
    return { error: errorState(translateVariablesError(variablesResult, t)) };
  }

  return {
    payload: {
      category: fields.category,
      variables: variablesResult.data,
      language: fields.language === '' ? 'en' : fields.language,
      description: fields.description === '' ? null : fields.description,
    },
  };
}

export async function createTemplateAction(
  _prevState: TemplateActionState,
  formData: FormData
): Promise<TemplateActionState> {
  const fields = extractCreateFields(formData);
  const t = await getTranslations('whatsappTemplates');

  const validation = validateAndBuild(fields, t);
  if ('error' in validation) return validation.error;

  const { error } = await createWhatsAppTemplate(fields.orgId, {
    channelConnectionId: fields.channelConnectionId,
    name: fields.name,
    body: fields.body,
    language: validation.payload.language,
    variables: validation.payload.variables,
    category: validation.payload.category,
    description: validation.payload.description,
  });

  if (error !== null) return errorState(error);

  revalidatePath(`/orgs/${fields.slug}/whatsapp-templates`);
  return { message: t('toasts.createSuccess'), type: 'success' };
}

export async function deleteTemplateAction(
  orgId: string,
  slug: string,
  templateId: string
): Promise<{ error: string | null }> {
  const result = await deleteWhatsAppTemplate(orgId, templateId);
  if (result.error === null) revalidatePath(`/orgs/${slug}/whatsapp-templates`);
  return result;
}
