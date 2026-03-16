import { FIRST_INDEX, INCREMENT_BY_ONE } from '@src/constants/index.js';
import type { SMNextOptions } from '@src/types/stateMachine.js';

import { buildDecisionOnlyOutputFormatPrompt, buildOutputFormatPrompt } from './prompts/index.js';

const resolveFallbackIndex = (edges: SMNextOptions['edges'], fallbackNodeId?: string): number => {
  if (fallbackNodeId === undefined) return INCREMENT_BY_ONE;
  const index = edges.findIndex((e) => e.to === fallbackNodeId);
  return index >= FIRST_INDEX ? index + INCREMENT_BY_ONE : INCREMENT_BY_ONE;
};

export const buildDecisionFallback = (edges: SMNextOptions['edges'], fallbackNodeId?: string): string => {
  const fallbackIndex = resolveFallbackIndex(edges, fallbackNodeId);
  return `**Fallback** — \`nextNodeID: ${fallbackIndex}\`\nIf unclear, default to Option ${fallbackIndex}.`;
};

export const buildEdgeIds = (edges: SMNextOptions['edges']): string =>
  edges.map((_, i) => i + INCREMENT_BY_ONE).join('|');

interface AppendKindParams {
  kind: SMNextOptions['kind'];
  edges: SMNextOptions['edges'];
  basePrompt: string;
  basePromptWithoutTools: string;
  fallbackNodeId?: string;
  nextNodeIsUser?: boolean;
}

function buildAgentDecisionPrompts(params: AppendKindParams): { prompt: string; promptWithoutTools: string } {
  const { edges, basePrompt, basePromptWithoutTools, fallbackNodeId, nextNodeIsUser } = params;
  const fallback = buildDecisionFallback(edges, fallbackNodeId);
  const edgeIds = buildEdgeIds(edges);
  const outputFormat =
    nextNodeIsUser === true ? buildOutputFormatPrompt(edgeIds) : buildDecisionOnlyOutputFormatPrompt(edgeIds);
  return {
    prompt: `${basePrompt}\n\n${fallback}\n\n${outputFormat}`,
    promptWithoutTools: `${basePromptWithoutTools}\n\n${fallback}\n\n${outputFormat}`,
  };
}

export const appendKindSpecificPrompts = (
  params: AppendKindParams
): { prompt: string; promptWithoutTools: string } => {
  const { kind, edges, basePrompt, basePromptWithoutTools } = params;
  if (kind === 'agent_decision') return buildAgentDecisionPrompts(params);
  if (kind === 'user_reply') {
    const edgeIds = buildEdgeIds(edges);
    const outputFormat =
      params.nextNodeIsUser === true
        ? buildOutputFormatPrompt(edgeIds)
        : buildDecisionOnlyOutputFormatPrompt(edgeIds);
    return {
      prompt: `${basePrompt}\n\n${outputFormat}`,
      promptWithoutTools: `${basePromptWithoutTools}\n\n${outputFormat}`,
    };
  }
  return { prompt: basePrompt, promptWithoutTools: basePromptWithoutTools };
};
