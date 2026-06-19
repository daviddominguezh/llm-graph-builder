import { z } from 'zod';

import {
  GET_LEAD_SCORE_TOOL_NAME,
  type LeadScoringServices,
  SET_LEAD_SCORE_TOOL_NAME,
} from '../../tools/leadScoringTools.js';
import type { ProviderCtx } from '../provider.js';
import type { OpenFlowTool } from '../types.js';

function parseArgs<S extends z.ZodType>(schema: S, args: unknown): z.infer<S> {
  return schema.parse(args);
}

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
  return value !== null && typeof value === 'object' && 'setLeadScore' in value && 'getLeadScore' in value;
}

function resolveService(ctx: ProviderCtx): LeadScoringServices | undefined {
  const raw = ctx.services('lead_scoring');
  if (raw === undefined) return undefined;
  // ctx.services is now typed to return the bundle shape directly. We still
  // keep the runtime predicate as a sanity check at the trust boundary.
  return isLeadScoringServiceShape(raw.service) ? raw.service : undefined;
}

function buildSetTool(service: LeadScoringServices): OpenFlowTool {
  return {
    description:
      'Set the lead score for the current conversation. ' +
      'Score must be 0-100. The conversation is identified automatically.',
    inputSchema: setLeadScoreSchema,
    execute: async (args: unknown) => {
      const { score } = parseArgs(setLeadScoreSchema, args);
      await service.setLeadScore(score);
      return { result: `Lead score set to ${String(score)}` };
    },
  };
}

function buildGetTool(service: LeadScoringServices): OpenFlowTool {
  return {
    description:
      'Get the current lead score for this conversation. ' +
      'Returns the score (0-100) or null if not yet scored.',
    inputSchema: getLeadScoreSchema,
    execute: async (_args: unknown) => {
      const score = await service.getLeadScore();
      if (score === null) return { result: { lead_score: null } };
      return { result: { lead_score: score } };
    },
  };
}

type LeadScoringToolName = typeof SET_LEAD_SCORE_TOOL_NAME | typeof GET_LEAD_SCORE_TOOL_NAME;

function buildAllTools(service: LeadScoringServices): Record<LeadScoringToolName, OpenFlowTool> {
  return {
    [SET_LEAD_SCORE_TOOL_NAME]: buildSetTool(service),
    [GET_LEAD_SCORE_TOOL_NAME]: buildGetTool(service),
  };
}

export async function buildLeadScoringTools(args: {
  toolNames: string[];
  ctx: ProviderCtx;
}): Promise<Partial<Record<LeadScoringToolName, OpenFlowTool>>> {
  const service = resolveService(args.ctx);
  if (service === undefined) return await Promise.resolve({});

  const allTools = buildAllTools(service);
  const filtered: Partial<Record<LeadScoringToolName, OpenFlowTool>> = {};
  for (const name of args.toolNames) {
    if (!isLeadScoringToolName(name)) continue;
    const { [name]: tool } = allTools;
    filtered[name] = tool;
  }
  return await Promise.resolve(filtered);
}

const LEAD_SCORING_TOOL_NAMES: readonly string[] = [SET_LEAD_SCORE_TOOL_NAME, GET_LEAD_SCORE_TOOL_NAME];

function isLeadScoringToolName(s: string): s is LeadScoringToolName {
  return LEAD_SCORING_TOOL_NAMES.includes(s);
}
