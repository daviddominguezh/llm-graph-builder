import type { ToolDescriptor } from '../provider.js';

const MIN_SCORE = 0;
const MAX_SCORE = 100;

const SET_DESCRIPTION =
  'Set the lead score for the current conversation. ' +
  'Score must be 0-100. The conversation is identified automatically.';

const GET_DESCRIPTION =
  'Get the current lead score for this conversation. ' +
  'Returns the score (0-100) or null if not yet scored.';

const setLeadScoreInputSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    score: {
      type: 'integer',
      minimum: MIN_SCORE,
      maximum: MAX_SCORE,
      description: 'Lead score from 0 to 100',
    },
  },
  required: ['score'],
};

const getLeadScoreInputSchema: Record<string, unknown> = {
  type: 'object',
  properties: {},
};

export const LEAD_SCORING_DESCRIPTORS: ToolDescriptor[] = [
  {
    toolName: 'set_lead_score',
    description: SET_DESCRIPTION,
    inputSchema: setLeadScoreInputSchema,
  },
  {
    toolName: 'get_lead_score',
    description: GET_DESCRIPTION,
    inputSchema: getLeadScoreInputSchema,
  },
];
