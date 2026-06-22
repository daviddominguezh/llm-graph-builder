import { describe, expect, it } from '@jest/globals';
import { RuntimeGraphSchema } from '@daviddh/graph-types';

import { EMPTY_GRAPH, buildAgentRuntimeGraph } from './agentRuntimeGraph.js';

const VALID = { id: 'mcp-1', name: 'My MCP', transport: { type: 'http', url: 'https://x.com/mcp' }, enabled: true };

describe('buildAgentRuntimeGraph', () => {
  it('null → EMPTY_GRAPH', () => {
    expect(buildAgentRuntimeGraph(null)).toBe(EMPTY_GRAPH);
  });
  it('no mcpServers → no mcpServers', () => {
    expect(buildAgentRuntimeGraph({ systemPrompt: 'hi' }).mcpServers).toBeUndefined();
  });
  it('valid mcpServers surfaced', () => {
    const g = buildAgentRuntimeGraph({ mcpServers: [VALID] });
    expect(g.startNode).toBe('INITIAL_STEP');
    expect(g.mcpServers?.[0]?.id).toBe('mcp-1');
  });
  it('preserves libraryItemId + variableValues', () => {
    const g = buildAgentRuntimeGraph({
      mcpServers: [{ ...VALID, libraryItemId: 'lib-9', variableValues: { T: { type: 'direct', value: 'a' } } }],
    });
    expect(g.mcpServers?.[0]?.libraryItemId).toBe('lib-9');
    expect(g.mcpServers?.[0]?.variableValues).toEqual({ T: { type: 'direct', value: 'a' } });
  });
  it('drops invalid entries', () => {
    expect(buildAgentRuntimeGraph({ mcpServers: [VALID, { id: 'bad' }] }).mcpServers).toHaveLength(1);
  });
  it('all-invalid → no mcpServers', () => {
    expect(buildAgentRuntimeGraph({ mcpServers: [{ id: 'bad' }] }).mcpServers).toBeUndefined();
  });
  it('EMPTY_GRAPH is frozen and schema-valid', () => {
    expect(Object.isFrozen(EMPTY_GRAPH)).toBe(true);
    expect(RuntimeGraphSchema.safeParse(EMPTY_GRAPH).success).toBe(true);
  });
});
