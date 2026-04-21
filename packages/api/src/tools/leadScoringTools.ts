import type { Tool } from 'ai';
import { zodSchema } from 'ai';
import { z } from 'zod';

import { CloserTool } from './toolEnum.js';

/* ─── Services interface ─── */

export interface LeadScoringServices {
  setLeadScore: (score: number) => Promise<void>;
  getLeadScore: () => Promise<number | null>;
}

/* ─── Tool name constants ─── */

const { setLeadScore: SET_LEAD_SCORE_TOOL_NAME, getLeadScore: GET_LEAD_SCORE_TOOL_NAME } = CloserTool;

export { SET_LEAD_SCORE_TOOL_NAME, GET_LEAD_SCORE_TOOL_NAME };

/* ─── Schemas ─── */

const MIN_SCORE = 0;
const MAX_SCORE = 100;

const setLeadScoreSchema = z.object({
  score: z.number().int().min(MIN_SCORE).max(MAX_SCORE).describe('Lead score from 0 to 100'),
});

/* ─── In-memory simulation store ─── */

interface SimulationStore {
  leadScore: number | null;
}

export function createSimulationStore(): SimulationStore {
  return { leadScore: null };
}

/* ─── Tool factories ─── */

function buildSimulationServices(contextData: Record<string, unknown>): LeadScoringServices {
  const { lead_score: dataScore } = contextData;
  const state: SimulationStore = {
    leadScore: typeof dataScore === 'number' ? dataScore : null,
  };

  const setLeadScore = async (score: number): Promise<void> => {
    await Promise.resolve();
    state.leadScore = score;
  };

  const getLeadScore = async (): Promise<number | null> => await Promise.resolve(state.leadScore);

  return { setLeadScore, getLeadScore };
}

interface CreateLeadScoringToolsParams {
  services?: LeadScoringServices;
  contextData?: Record<string, unknown>;
}

function resolveServices(params: CreateLeadScoringToolsParams): LeadScoringServices {
  if (params.services !== undefined) return params.services;
  return buildSimulationServices(params.contextData ?? {});
}

function buildSetLeadScoreTool(services: LeadScoringServices): Tool {
  return {
    description:
      'Set the lead score for the current conversation. ' +
      'Score must be 0-100. The conversation is identified automatically.',
    inputSchema: zodSchema(setLeadScoreSchema),
    execute: async (args: z.infer<typeof setLeadScoreSchema>) => {
      await services.setLeadScore(args.score);
      return { result: `Lead score set to ${String(args.score)}` };
    },
  };
}

function buildGetLeadScoreTool(services: LeadScoringServices): Tool {
  return {
    description:
      'Get the current lead score for this conversation. ' +
      'Returns the score (0-100) or null if not yet scored.',
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const score = await services.getLeadScore();
      if (score === null) return { result: { lead_score: null } };
      return { result: { lead_score: score } };
    },
  };
}

export function createLeadScoringTools(params: CreateLeadScoringToolsParams): Record<string, Tool> {
  const services = resolveServices(params);
  return {
    [SET_LEAD_SCORE_TOOL_NAME]: buildSetLeadScoreTool(services),
    [GET_LEAD_SCORE_TOOL_NAME]: buildGetLeadScoreTool(services),
  };
}
