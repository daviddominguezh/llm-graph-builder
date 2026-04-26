import { z } from 'zod';

import {
  type LeadScoringServices,
  SET_LEAD_SCORE_TOOL_NAME,
  GET_LEAD_SCORE_TOOL_NAME,
} from '../../tools/leadScoringTools.js';
import type { ProviderCtx } from '../provider.js';
import type { OpenFlowTool } from '../types.js';

export interface LeadScoringProviderServices {
  service: LeadScoringServices;
}

const MIN_SCORE = 0;
const MAX_SCORE = 100;

const setLeadScoreSchema = z
  .object({ score: z.number().int().min(MIN_SCORE).max(MAX_SCORE) })
  .describe('Lead score from 0 to 100');

const getLeadScoreSchema = z.object({});

function isLeadScoringServiceShape(value: unknown): value is LeadScoringServices {
  return (
    value !== null &&
    typeof value === 'object' &&
    'setLeadScore' in value &&
    'getLeadScore' in value
  );
}

function resolveService(ctx: ProviderCtx): LeadScoringServices | undefined {
  const raw = ctx.services('lead_scoring');
  if (raw === null || typeof raw !== 'object') return undefined;
  const service = Reflect.get(raw, 'service') as unknown;
  return isLeadScoringServiceShape(service) ? service : undefined;
}

function buildSetTool(service: LeadScoringServices): OpenFlowTool<typeof setLeadScoreSchema> {
  return {
    description:
      'Set the lead score for the current conversation. ' +
      'Score must be 0-100. The conversation is identified automatically.',
    inputSchema: setLeadScoreSchema,
    execute: async ({ score }: z.infer<typeof setLeadScoreSchema>) => {
      await service.setLeadScore(score);
      return { result: `Lead score set to ${String(score)}` };
    },
  };
}

function buildGetTool(service: LeadScoringServices): OpenFlowTool<typeof getLeadScoreSchema> {
  return {
    description:
      'Get the current lead score for this conversation. ' +
      'Returns the score (0-100) or null if not yet scored.',
    inputSchema: getLeadScoreSchema,
    execute: async () => {
      const score = await service.getLeadScore();
      if (score === null) return { result: { lead_score: null } };
      return { result: { lead_score: score } };
    },
  };
}

function buildAllTools(service: LeadScoringServices): Record<string, OpenFlowTool> {
  return {
    [SET_LEAD_SCORE_TOOL_NAME]: buildSetTool(service),
    [GET_LEAD_SCORE_TOOL_NAME]: buildGetTool(service),
  };
}

export async function buildLeadScoringTools(args: {
  toolNames: string[];
  ctx: ProviderCtx;
}): Promise<Record<string, OpenFlowTool>> {
  const service = resolveService(args.ctx);
  if (service === undefined) return await Promise.resolve({});

  const allTools = buildAllTools(service);
  const filtered: Record<string, OpenFlowTool> = {};
  for (const name of args.toolNames) {
    const { [name]: tool } = allTools;
    if (tool === undefined) continue;
    filtered[name] = tool;
  }
  return await Promise.resolve(filtered);
}
