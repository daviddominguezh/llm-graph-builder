import { RuntimeGraphSchema } from '@daviddh/graph-types';
import { describe, expect, it } from '@jest/globals';

import { EMPTY_GRAPH, buildAgentRuntimeGraph } from './agentRuntimeGraph.js';

const ONE_SERVER = 1;

const VALID = {
  id: 'mcp-1',
  name: 'My MCP',
  transport: { type: 'http', url: 'https://x.com/mcp' },
  enabled: true,
};

describe('buildAgentRuntimeGraph', () => {
  it('null → EMPTY_GRAPH', () => {
    expect(buildAgentRuntimeGraph(null)).toBe(EMPTY_GRAPH);
  });
  it('no mcpServers → no mcpServers', () => {
    expect(buildAgentRuntimeGraph({ systemPrompt: 'hi' }).mcpServers).toBeUndefined();
  });
  it('valid mcpServers surfaced', () => {
    const g = buildAgentRuntimeGraph({ mcpServers: [VALID] });
    const [first] = g.mcpServers ?? [];
    expect(g.startNode).toBe('INITIAL_STEP');
    expect(first?.id).toBe('mcp-1');
  });
  it('preserves libraryItemId + variableValues', () => {
    const g = buildAgentRuntimeGraph({
      mcpServers: [
        { ...VALID, libraryItemId: 'lib-9', variableValues: { T: { type: 'direct', value: 'a' } } },
      ],
    });
    const [first] = g.mcpServers ?? [];
    expect(first?.libraryItemId).toBe('lib-9');
    expect(first?.variableValues).toEqual({ T: { type: 'direct', value: 'a' } });
  });
  it('drops invalid entries', () => {
    expect(buildAgentRuntimeGraph({ mcpServers: [VALID, { id: 'bad' }] }).mcpServers).toHaveLength(
      ONE_SERVER
    );
  });
  it('all-invalid → no mcpServers', () => {
    expect(buildAgentRuntimeGraph({ mcpServers: [{ id: 'bad' }] }).mcpServers).toBeUndefined();
  });
  it('EMPTY_GRAPH is frozen and schema-valid', () => {
    expect(Object.isFrozen(EMPTY_GRAPH)).toBe(true);
    expect(RuntimeGraphSchema.safeParse(EMPTY_GRAPH).success).toBe(true);
  });
});
