import { z } from 'zod';

import { readFormField } from '../../lib/forms/readFormField.js';
import type { FormsService } from '../../services/formsService.js';
import { buildFormsToolDescription } from '../../tools/formsTools.js';
import { executeSet } from '../../tools/formsToolsExecute.js';
import type { FormDefinition } from '../../types/forms.js';
import type { ProviderCtx } from '../provider.js';
import type { OpenFlowTool } from '../types.js';

function parseArgs<S extends z.ZodType>(schema: S, args: unknown): z.infer<S> {
  return schema.parse(args);
}

export interface FormsServices {
  service: FormsService;
  forms: FormDefinition[];
}

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

type GetInput = z.infer<typeof getInput>;

function isFormsServices(value: unknown): value is FormsServices {
  if (typeof value !== 'object' || value === null) return false;
  return 'service' in value && 'forms' in value;
}

function buildSetTool(svc: FormsServices, conversationId: string): OpenFlowTool {
  const params = { forms: svc.forms, services: svc.service, conversationId };
  return {
    description: buildFormsToolDescription(svc.forms),
    inputSchema: setInput,
    execute: async (args: unknown) => await executeSet(parseArgs(setInput, args), params),
  };
}

async function executeGet(
  args: GetInput,
  svc: FormsServices,
  conversationId: string
): Promise<{ result: unknown }> {
  const form = svc.forms.find((f) => f.formSlug === args.formSlug);
  if (form === undefined) return { result: null };
  const data = await svc.service.getFormData(conversationId, form.id);
  return { result: readFormField(data, args.fieldPath) };
}

function buildGetTool(svc: FormsServices, conversationId: string): OpenFlowTool {
  return {
    description: buildFormsToolDescription(svc.forms),
    inputSchema: getInput,
    execute: async (args: unknown) => await executeGet(parseArgs(getInput, args), svc, conversationId),
  };
}

function buildAll(svc: FormsServices, conversationId: string): Record<string, OpenFlowTool> {
  return {
    set_form_fields: buildSetTool(svc, conversationId),
    get_form_field: buildGetTool(svc, conversationId),
  };
}

function filterByNames(all: Record<string, OpenFlowTool>, names: string[]): Record<string, OpenFlowTool> {
  return Object.fromEntries(
    names.flatMap((name) => {
      const { [name]: tool } = all;
      return tool === undefined ? [] : [[name, tool]];
    })
  );
}

export async function buildFormsTools(args: {
  toolNames: string[];
  ctx: ProviderCtx;
}): Promise<Record<string, OpenFlowTool>> {
  const raw = await Promise.resolve(args.ctx.services('forms'));
  if (isFormsServices(raw) && args.ctx.conversationId !== undefined) {
    const all = buildAll(raw, args.ctx.conversationId);
    return filterByNames(all, args.toolNames);
  }
  return {};
}
