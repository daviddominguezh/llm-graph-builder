import type { Graph } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Mock function types                                                */
/* ------------------------------------------------------------------ */

type AssembleGraphFn = (supabase: SupabaseClient, agentId: string) => Promise<Graph | null>;

type ExecuteOperationsBatchFn = (
  supabase: SupabaseClient,
  agentId: string,
  operations: unknown[]
) => Promise<void>;

/* ------------------------------------------------------------------ */
/*  Mock registrations                                                 */
/* ------------------------------------------------------------------ */

const mockAssembleGraph = jest.fn<AssembleGraphFn>();
const mockExecuteOperationsBatch = jest.fn<ExecuteOperationsBatchFn>();

jest.unstable_mockModule('../../db/queries/graphQueries.js', () => ({
  assembleGraph: mockAssembleGraph,
}));

jest.unstable_mockModule('../../db/queries/operationExecutor.js', () => ({
  executeOperationsBatch: mockExecuteOperationsBatch,
}));

const { listAgentDomains, addAgentDomain, updateAgentDomain, deleteAgentDomain } =
  await import('../services/agentDomainService.js');

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const mockCreateSupabase = jest.fn<() => SupabaseClient>();

function buildCtx(): ServiceContext {
  return { supabase: mockCreateSupabase(), orgId: 'org-1', keyId: 'key-1' };
}

const testGraph: Graph = {
  startNode: 'Start',
  agents: [
    { id: 'greet', description: 'Greeting domain' },
    { id: 'checkout', description: 'Checkout domain' },
    { id: 'empty', description: 'Unused domain' },
  ],
  nodes: [
    { id: 'Start', text: 'Welcome', kind: 'agent', agent: 'greet', global: false, description: '' },
    { id: 'AskName', text: 'Ask name', kind: 'agent', agent: 'greet', global: false, description: '' },
    { id: 'CartView', text: 'Cart', kind: 'agent', agent: 'checkout', global: false, description: '' },
    { id: 'GlobalFAQ', text: 'FAQ', kind: 'agent', global: true, description: '' },
  ],
  edges: [],
};

const DOMAIN_COUNT = 3;
const GREET_NODE_COUNT = 2;
const CHECKOUT_NODE_COUNT = 1;
const EMPTY_NODE_COUNT = 0;

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  listAgentDomains                                                   */
/* ------------------------------------------------------------------ */

describe('listAgentDomains', () => {
  it('returns domains with correct node counts', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(testGraph);

    const result = await listAgentDomains(ctx, 'agent-1');

    expect(result).toHaveLength(DOMAIN_COUNT);
    expect(result).toEqual([
      { key: 'greet', description: 'Greeting domain', nodeCount: GREET_NODE_COUNT },
      { key: 'checkout', description: 'Checkout domain', nodeCount: CHECKOUT_NODE_COUNT },
      { key: 'empty', description: 'Unused domain', nodeCount: EMPTY_NODE_COUNT },
    ]);
    expect(mockAssembleGraph).toHaveBeenCalledWith(ctx.supabase, 'agent-1');
  });

  it('throws when graph is not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(listAgentDomains(buildCtx(), 'agent-1')).rejects.toThrow(
      'Graph not found for agent: agent-1'
    );
  });
});

/* ------------------------------------------------------------------ */
/*  addAgentDomain                                                     */
/* ------------------------------------------------------------------ */

describe('addAgentDomain', () => {
  it('calls executeOperationsBatch with insertAgent operation', async () => {
    const ctx = buildCtx();
    mockExecuteOperationsBatch.mockResolvedValue(undefined);

    await addAgentDomain(ctx, 'agent-1', 'support', 'Support domain');

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      { type: 'insertAgent', data: { agentKey: 'support', description: 'Support domain' } },
    ]);
  });

  it('calls executeOperationsBatch without description when not provided', async () => {
    const ctx = buildCtx();
    mockExecuteOperationsBatch.mockResolvedValue(undefined);

    await addAgentDomain(ctx, 'agent-1', 'support');

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      { type: 'insertAgent', data: { agentKey: 'support', description: undefined } },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/*  updateAgentDomain                                                  */
/* ------------------------------------------------------------------ */

describe('updateAgentDomain', () => {
  it('calls executeOperationsBatch with updateAgent operation', async () => {
    const ctx = buildCtx();
    mockExecuteOperationsBatch.mockResolvedValue(undefined);

    await updateAgentDomain(ctx, 'agent-1', 'greet', 'Updated greeting');

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      { type: 'updateAgent', data: { agentKey: 'greet', description: 'Updated greeting' } },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/*  deleteAgentDomain                                                  */
/* ------------------------------------------------------------------ */

describe('deleteAgentDomain', () => {
  it('deletes domain when no nodes reference it', async () => {
    const ctx = buildCtx();
    mockAssembleGraph.mockResolvedValue(testGraph);
    mockExecuteOperationsBatch.mockResolvedValue(undefined);

    await deleteAgentDomain(ctx, 'agent-1', 'empty');

    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(ctx.supabase, 'agent-1', [
      { type: 'deleteAgent', agentKey: 'empty' },
    ]);
  });

  it('throws when nodes still reference the domain', async () => {
    mockAssembleGraph.mockResolvedValue(testGraph);

    await expect(deleteAgentDomain(buildCtx(), 'agent-1', 'greet')).rejects.toThrow(
      'Cannot delete domain "greet": nodes still reference it: Start, AskName'
    );
    expect(mockExecuteOperationsBatch).not.toHaveBeenCalled();
  });

  it('throws when graph is not found', async () => {
    mockAssembleGraph.mockResolvedValue(null);

    await expect(deleteAgentDomain(buildCtx(), 'agent-1', 'greet')).rejects.toThrow(
      'Graph not found for agent: agent-1'
    );
  });
});
