import { FIRST_INDEX } from '@src/constants/index.js';

import type { SMNextOptions } from '../types/stateMachine.js';
import type { getNode } from './graph/index.js';

export function buildStructuredOutputNodes(
  firstEdge: SMNextOptions['edges'][number] | undefined
): Record<string, string> {
  if (firstEdge === undefined) return {};
  return { [firstEdge.to]: firstEdge.to };
}

export function buildStructuredOutputOptions(
  node: ReturnType<typeof getNode>,
  edges: SMNextOptions['edges']
): SMNextOptions {
  const [firstEdge] = edges;
  return {
    node,
    edges,
    prompt: node.outputPrompt ?? '',
    promptWithoutToolPreconditions: node.outputPrompt ?? '',
    toolsByEdge: {},
    nextNode: firstEdge?.to,
    kind: 'structured_output',
    nodes: buildStructuredOutputNodes(firstEdge),
    outputSchema: node.outputSchema,
  };
}

export function hasOutputSchema(node: ReturnType<typeof getNode>): boolean {
  return node.outputSchema !== undefined && node.outputSchema.length > FIRST_INDEX;
}
