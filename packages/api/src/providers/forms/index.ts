import type { BuiltinProvider, ProviderCtx, ToolDescriptor } from '../provider.js';
import { buildFormsTools } from './buildTools.js';
import { FORMS_DESCRIPTORS } from './descriptors.js';

async function describeFormsTools(_ctx: ProviderCtx): Promise<ToolDescriptor[]> {
  return await Promise.resolve(FORMS_DESCRIPTORS);
}

const TOOL_NAMES = ['set_form_fields', 'get_form_field'] as const;

export const formsProvider: BuiltinProvider<'forms', typeof TOOL_NAMES> = {
  type: 'builtin',
  id: 'forms',
  displayName: 'OpenFlow/Forms',
  description: 'Read and write structured form fields scoped to the current conversation.',
  toolNames: TOOL_NAMES,
  describeTools: describeFormsTools,
  buildTools: buildFormsTools,
};
