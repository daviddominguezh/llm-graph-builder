import type { Edge, Precondition } from '@daviddh/graph-types';

import type { ProviderCtx } from '../providers/provider.js';
import type { Registry } from '../providers/registry.js';
import type { OpenFlowTool } from '../providers/types.js';

export interface ResolveToolsArgs {
  registry: Registry;
  ctx: ProviderCtx;
  currentNodeOutgoingEdges: Edge[];
}

export interface ResolveToolsResult {
  tools: Record<string, OpenFlowTool>;
  toolName: string | null;
}

interface ToolCallRef {
  providerType: 'builtin' | 'mcp';
  providerId: string;
  toolName: string;
}

const FIRST_INDEX = 0;
const EMPTY_RESULT: ResolveToolsResult = { tools: {}, toolName: null };

function extractToolCallRef(precondition: Precondition): ToolCallRef | null {
  if (precondition.type !== 'tool_call') return null;
  return precondition.tool;
}

function findToolCallPrecondition(edges: Edge[]): ToolCallRef | null {
  for (const edge of edges) {
    const first = edge.preconditions?.[FIRST_INDEX];
    if (first === undefined) continue;
    const ref = extractToolCallRef(first);
    if (ref !== null) return ref;
  }
  return null;
}

export async function resolveToolsForCurrentNode(args: ResolveToolsArgs): Promise<ResolveToolsResult> {
  const ref = findToolCallPrecondition(args.currentNodeOutgoingEdges);
  if (ref === null) return EMPTY_RESULT;

  const provider = args.registry.providers.find(
    (p) => p.type === ref.providerType && p.id === ref.providerId
  );

  if (provider === undefined) {
    throw new Error(
      `Workflow tool_call references provider not in registry: ${ref.providerType}:${ref.providerId}:${ref.toolName}`
    );
  }

  const tools = await provider.buildTools({ toolNames: [ref.toolName], ctx: args.ctx });
  return { tools, toolName: ref.toolName };
}
