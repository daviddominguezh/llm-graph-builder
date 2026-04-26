import type { Provider } from '../provider.js';

import { buildCompositionTools } from './buildTools.js';
import { COMPOSITION_DESCRIPTORS } from './descriptors.js';

export const compositionProvider: Provider = {
  type: 'builtin',
  id: 'composition',
  displayName: 'OpenFlow/Composition',
  description: 'Dispatch sub-agents, invoke other agents/workflows.',
  describeTools: async () => await Promise.resolve(COMPOSITION_DESCRIPTORS),
  buildTools: buildCompositionTools,
};
