import type { Provider, ToolDescriptor } from '../provider.js';
import { buildLeadScoringTools } from './buildTools.js';
import { LEAD_SCORING_DESCRIPTORS } from './descriptors.js';

async function describeTools(): Promise<ToolDescriptor[]> {
  return await Promise.resolve(LEAD_SCORING_DESCRIPTORS);
}

export const leadScoringProvider: Provider = {
  type: 'builtin',
  id: 'lead_scoring',
  displayName: 'OpenFlow/Lead Scoring',
  description: 'Read and update structured lead-scoring signals for the current conversation.',
  describeTools,
  buildTools: buildLeadScoringTools,
};
