import type { Provider, ProviderCtx, ToolDescriptor } from '../provider.js';

import { buildFormsTools } from './buildTools.js';
import { FORMS_DESCRIPTORS } from './descriptors.js';

async function describeFormsTools(_ctx: ProviderCtx): Promise<ToolDescriptor[]> {
  return await Promise.resolve(FORMS_DESCRIPTORS);
}

export const formsProvider: Provider = {
  type: 'builtin',
  id: 'forms',
  displayName: 'OpenFlow/Forms',
  description: 'Read and write structured form fields scoped to the current conversation.',
  describeTools: describeFormsTools,
  buildTools: buildFormsTools,
};
