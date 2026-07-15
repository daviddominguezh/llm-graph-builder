import type { Operation } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type Fn = jest.MockedFunction<(...args: unknown[]) => Promise<void>>;
const fn = (): Fn => jest.fn<(...args: unknown[]) => Promise<void>>();

const insertNode = fn();
const updateNode = fn();
const deleteNode = fn();
const insertEdge = fn();
const updateEdge = fn();
const deleteEdge = fn();
const insertAgent = fn();
const updateAgent = fn();
const deleteAgent = fn();
const insertMcpServer = fn();
const updateMcpServer = fn();
const deleteMcpServer = fn();
const insertOutputSchema = fn();
const updateOutputSchema = fn();
const deleteOutputSchema = fn();
const insertContextPreset = fn();
const updateContextPreset = fn();
const deleteContextPreset = fn();
const updateStartNode = fn();
const updateAgentConfig = fn();
const insertContextItem = fn();
const updateContextItem = fn();
const deleteContextItem = fn();
const reorderContextItems = fn();
const insertSkill = fn();
const deleteSkill = fn();
const deleteManySkills = fn();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({}),
}));
jest.unstable_mockModule('../nodeOperations.js', () => ({ insertNode, updateNode, deleteNode }));
jest.unstable_mockModule('../edgeOperations.js', () => ({ insertEdge, updateEdge, deleteEdge }));
jest.unstable_mockModule('../agentOperations.js', () => ({ insertAgent, updateAgent, deleteAgent }));
jest.unstable_mockModule('../mcpServerOperations.js', () => ({
  insertMcpServer,
  updateMcpServer,
  deleteMcpServer,
}));
jest.unstable_mockModule('../outputSchemaOperations.js', () => ({
  insertOutputSchema,
  updateOutputSchema,
  deleteOutputSchema,
}));
jest.unstable_mockModule('../contextPresetOperations.js', () => ({
  insertContextPreset,
  updateContextPreset,
  deleteContextPreset,
}));
jest.unstable_mockModule('../startNodeOperations.js', () => ({ updateStartNode }));
jest.unstable_mockModule('../agentConfigOperations.js', () => ({
  updateAgentConfig,
  insertContextItem,
  updateContextItem,
  deleteContextItem,
  reorderContextItems,
  insertSkill,
  deleteSkill,
  deleteManySkills,
}));

const { createClient } = await import('@supabase/supabase-js');
const { executeSingleOperation } = await import('../operationDispatch.js');

const AGENT = 'agent-1';
const ORDER_A = 1;
const ORDER_B = 2;
const SORT_ZERO = 0;
const sb = createClient('https://fake.supabase.co', 'fake-key');
const run = async (op: Operation): Promise<void> => {
  await executeSingleOperation(sb, AGENT, op);
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('executeSingleOperation node and edge dispatch', () => {
  it('dispatches node operations', async () => {
    const data = { nodeId: 'n1', text: 't', kind: 'agent' as const };
    await run({ type: 'insertNode', data });
    expect(insertNode).toHaveBeenCalledWith(sb, AGENT, data);
    await run({ type: 'updateNode', data });
    expect(updateNode).toHaveBeenCalledWith(sb, AGENT, data);
    await run({ type: 'deleteNode', nodeId: 'n1' });
    expect(deleteNode).toHaveBeenCalledWith(sb, AGENT, 'n1');
  });

  it('dispatches edge operations', async () => {
    const data = { from: 'a', to: 'b' };
    await run({ type: 'insertEdge', data });
    expect(insertEdge).toHaveBeenCalledWith(sb, AGENT, data);
    await run({ type: 'updateEdge', data });
    expect(updateEdge).toHaveBeenCalledWith(sb, AGENT, data);
    await run({ type: 'deleteEdge', from: 'a', to: 'b' });
    expect(deleteEdge).toHaveBeenCalledWith(sb, AGENT, 'a', 'b');
  });

});

describe('executeSingleOperation agent, mcp and output-schema dispatch', () => {
  it('dispatches agent operations', async () => {
    const data = { agentKey: 'k' };
    await run({ type: 'insertAgent', data });
    expect(insertAgent).toHaveBeenCalledWith(sb, AGENT, data);
    await run({ type: 'updateAgent', data });
    expect(updateAgent).toHaveBeenCalledWith(sb, AGENT, data);
    await run({ type: 'deleteAgent', agentKey: 'k' });
    expect(deleteAgent).toHaveBeenCalledWith(sb, AGENT, 'k');
  });

  it('dispatches mcp-server operations', async () => {
    const data = { serverId: 's1', name: 'srv', transport: { type: 'http' as const, url: 'u' } };
    await run({ type: 'insertMcpServer', data });
    expect(insertMcpServer).toHaveBeenCalledWith(sb, AGENT, data);
    await run({ type: 'updateMcpServer', data });
    expect(updateMcpServer).toHaveBeenCalledWith(sb, AGENT, data);
    await run({ type: 'deleteMcpServer', serverId: 's1' });
    expect(deleteMcpServer).toHaveBeenCalledWith(sb, AGENT, 's1');
  });

  it('dispatches output-schema and start-node operations', async () => {
    const data = { schemaId: 'os1', name: 'n', fields: [] };
    await run({ type: 'insertOutputSchema', data });
    expect(insertOutputSchema).toHaveBeenCalledWith(sb, AGENT, data);
    await run({ type: 'updateOutputSchema', data });
    expect(updateOutputSchema).toHaveBeenCalledWith(sb, AGENT, data);
    await run({ type: 'deleteOutputSchema', schemaId: 'os1' });
    expect(deleteOutputSchema).toHaveBeenCalledWith(sb, AGENT, 'os1');
    await run({ type: 'updateStartNode', startNode: 'start' });
    expect(updateStartNode).toHaveBeenCalledWith(sb, AGENT, 'start');
  });

});

describe('executeSingleOperation preset, config and skill dispatch', () => {
  it('dispatches context-preset operations', async () => {
    const data = { name: 'p' };
    await run({ type: 'insertContextPreset', data });
    expect(insertContextPreset).toHaveBeenCalledWith(sb, AGENT, data);
    await run({ type: 'updateContextPreset', data });
    expect(updateContextPreset).toHaveBeenCalledWith(sb, AGENT, data);
    await run({ type: 'deleteContextPreset', name: 'p' });
    expect(deleteContextPreset).toHaveBeenCalledWith(sb, AGENT, 'p');
  });

  it('dispatches agent-config and context-item operations', async () => {
    const config = { systemPrompt: 's' };
    await run({ type: 'updateAgentConfig', data: config });
    expect(updateAgentConfig).toHaveBeenCalledWith(sb, AGENT, config);
    const item = { sortOrder: ORDER_A, content: 'c' };
    await run({ type: 'insertContextItem', data: item });
    expect(insertContextItem).toHaveBeenCalledWith(sb, AGENT, item);
    await run({ type: 'updateContextItem', data: item });
    expect(updateContextItem).toHaveBeenCalledWith(sb, AGENT, item);
    await run({ type: 'deleteContextItem', data: { sortOrder: ORDER_A } });
    expect(deleteContextItem).toHaveBeenCalledWith(sb, AGENT, { sortOrder: ORDER_A });
    await run({ type: 'reorderContextItems', data: { sortOrders: [ORDER_A, ORDER_B] } });
    expect(reorderContextItems).toHaveBeenCalledWith(sb, AGENT, { sortOrders: [ORDER_A, ORDER_B] });
  });

  it('dispatches skill operations', async () => {
    const skill = { name: 'n', description: 'd', content: 'c', repoUrl: 'r', sortOrder: SORT_ZERO };
    await run({ type: 'insertSkill', data: skill });
    expect(insertSkill).toHaveBeenCalledWith(sb, AGENT, skill);
    await run({ type: 'deleteSkill', data: { name: 'n' } });
    expect(deleteSkill).toHaveBeenCalledWith(sb, AGENT, { name: 'n' });
    await run({ type: 'deleteManySkills', data: { names: ['x', 'y'] } });
    expect(deleteManySkills).toHaveBeenCalledWith(sb, AGENT, { names: ['x', 'y'] });
  });

  it('throws on an unknown operation type', async () => {
    // @ts-expect-error deliberately passing an unsupported operation type
    await expect(run({ type: 'bogus' })).rejects.toThrow('Unhandled operation type: bogus');
  });
});
