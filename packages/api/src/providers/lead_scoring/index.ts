import { GET_LEAD_SCORE_TOOL_NAME, SET_LEAD_SCORE_TOOL_NAME } from '../../tools/leadScoringTools.js';
import type { BuiltinProvider, ToolDescriptor } from '../provider.js';
import { buildLeadScoringTools } from './buildTools.js';
import { LEAD_SCORING_DESCRIPTORS } from './descriptors.js';

async function describeTools(): Promise<ToolDescriptor[]> {
  return await Promise.resolve(LEAD_SCORING_DESCRIPTORS);
}

const TOOL_NAMES = [SET_LEAD_SCORE_TOOL_NAME, GET_LEAD_SCORE_TOOL_NAME] as const;

export const leadScoringProvider: BuiltinProvider<'lead_scoring', typeof TOOL_NAMES> = {
  type: 'builtin',
  id: 'lead_scoring',
  displayName: 'OpenFlow/Lead Scoring',
  description: 'Read and update structured lead-scoring signals for the current conversation.',
  toolNames: TOOL_NAMES,
  describeTools,
  buildTools: buildLeadScoringTools,
};
