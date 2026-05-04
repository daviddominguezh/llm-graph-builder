import type { Edge } from '@daviddh/graph-types';
import { describe, expect, it, jest } from '@jest/globals';
import { z } from 'zod';

import type { Provider, ProviderCtx, ToolDescriptor } from '../../providers/provider.js';
import type { Registry } from '../../providers/registry.js';
import type { OpenFlowTool } from '../../providers/types.js';
import { resolveToolsForCurrentNode } from '../resolveToolsForCurrentNode.js';

function makeCtx(): ProviderCtx {
  return {
    orgId: 'org-1',
    agentId: 'agent-1',
    isChildAgent: false,
    logger: {
      error: jest.fn(),
      warn: jest.fn(),
      help: jest.fn(),
      data: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      prompt: jest.fn(),
      http: jest.fn(),
      verbose: jest.fn(),
      input: jest.fn(),
      silly: jest.fn(),
    },
    oauthTokens: new Map(),
    mcpServers: new Map(),
    services: () => undefined,
  };
}

function makeRegistry(providers: readonly Provider[]): Registry {
  return {
    providers,
    findToolByName: async () => await Promise.resolve(null),
    buildSelected: async () => await Promise.resolve({ tools: {}, staleRefs: [], failedProviders: [] }),
    describeAll: async () => await Promise.resolve([]),
  };
}

function makeStubTool(): OpenFlowTool {
  return {
    description: '',
    inputSchema: z.object({}),
    execute: async () => await Promise.resolve(null),
  };
}

function makeCalendarProvider(): Provider {
  return {
    type: 'builtin',
    id: 'calendar',
    displayName: 'cal',
    describeTools: async (): Promise<ToolDescriptor[]> => await Promise.resolve([]),
    buildTools: jest.fn(
      async (): Promise<Record<string, OpenFlowTool>> =>
        await Promise.resolve({ check_availability: makeStubTool() })
    ),
  };
}

function makeToolCallEdge(providerId: string, toolName: string): Edge {
  return {
    from: 'a',
    to: 'b',
    preconditions: [{ type: 'tool_call', tool: { providerType: 'builtin', providerId, toolName } }],
  };
}

describe('resolveToolsForCurrentNode', () => {
  it('returns empty when no tool_call edge', async () => {
    const result = await resolveToolsForCurrentNode({
      registry: makeRegistry([]),
      ctx: makeCtx(),
      currentNodeOutgoingEdges: [],
    });
    expect(result.tools).toEqual({});
    expect(result.toolName).toBeNull();
  });

  it('throws when tool_call references unknown provider', async () => {
    const edges: Edge[] = [makeToolCallEdge('nonexistent', 'x')];
    await expect(
      resolveToolsForCurrentNode({
        registry: makeRegistry([]),
        ctx: makeCtx(),
        currentNodeOutgoingEdges: edges,
      })
    ).rejects.toThrow();
  });

  it('builds and returns the single tool when found', async () => {
    const provider = makeCalendarProvider();
    const edges: Edge[] = [makeToolCallEdge('calendar', 'check_availability')];
    const result = await resolveToolsForCurrentNode({
      registry: makeRegistry([provider]),
      ctx: makeCtx(),
      currentNodeOutgoingEdges: edges,
    });
    expect(result.toolName).toBe('check_availability');
    expect(result.tools.check_availability).toBeDefined();
  });
});
