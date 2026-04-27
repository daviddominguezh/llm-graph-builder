import type { Tool } from 'ai';
import { zodSchema } from 'ai';
import { z } from 'zod';

import { readFormField } from '../lib/forms/readFormField.js';
import type { FormsService } from '../services/formsService.js';
import type { FormDefinition } from '../types/forms.js';
import { buildFormsToolDescription } from './formsToolsDescription.js';
import { executeSet, notFound } from './formsToolsExecute.js';
import { CloserTool } from './toolEnum.js';

export { buildFormsToolDescription } from './formsToolsDescription.js';

const { setFormFields: SET_FORM_FIELDS_TOOL_NAME, getFormField: GET_FORM_FIELD_TOOL_NAME } = CloserTool;
export { SET_FORM_FIELDS_TOOL_NAME, GET_FORM_FIELD_TOOL_NAME };

const MIN_LENGTH = 1;

const setInput = z.object({
  formSlug: z.string().min(MIN_LENGTH),
  fields: z
    .array(z.object({ fieldPath: z.string().min(MIN_LENGTH), fieldValue: z.unknown() }))
    .min(MIN_LENGTH),
});
const getInput = z.object({
  formSlug: z.string().min(MIN_LENGTH),
  fieldPath: z.string().min(MIN_LENGTH),
});

export interface CreateFormsToolsParams {
  forms: FormDefinition[];
  services: FormsService;
  conversationId: string;
}

export function createFormsTools(p: CreateFormsToolsParams): Record<string, Tool> {
  return {
    [SET_FORM_FIELDS_TOOL_NAME]: buildSet(p),
    [GET_FORM_FIELD_TOOL_NAME]: buildGet(p),
  };
}

function buildSet(p: CreateFormsToolsParams): Tool {
  return {
    description: buildFormsToolDescription(p.forms),
    inputSchema: zodSchema(setInput),
    execute: async (args: z.infer<typeof setInput>) => await executeSet(args, p),
  };
}

function buildGet(p: CreateFormsToolsParams): Tool {
  return {
    description: buildFormsToolDescription(p.forms),
    inputSchema: zodSchema(getInput),
    execute: async (args: z.infer<typeof getInput>) => await executeGet(args, p),
  };
}

async function executeGet(
  args: z.infer<typeof getInput>,
  p: CreateFormsToolsParams
): Promise<{ result: unknown }> {
  const form = p.forms.find((f) => f.formSlug === args.formSlug);
  if (form === undefined) return notFound(args.formSlug, p.forms);
  const data = await p.services.getFormData(p.conversationId, form.id);
  return { result: readFormField(data, args.fieldPath) };
}
