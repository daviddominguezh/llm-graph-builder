import type { Graph, McpServerConfig, McpTransport } from '@daviddh/graph-types';
import { describe, expect, it } from '@jest/globals';

import { resolveMcpEnvVars } from './simulateHelpers.js';

const FIRST = 0;

const baseGraph: Omit<Graph, 'mcpServers'> = {
  startNode: 'Start',
  agents: [{ id: 'main', description: 'm' }],
  nodes: [{ id: 'Start', text: 'h', kind: 'agent', agent: 'main', global: false, description: '' }],
  edges: [],
};

function resolveServer(server: McpServerConfig, envById: Record<string, string>): McpTransport | undefined {
  const out = resolveMcpEnvVars({ ...baseGraph, mcpServers: [server] }, envById);
  return out.mcpServers?.at(FIRST)?.transport;
}

describe('resolveMcpEnvVars (simulate)', () => {
  it('substitutes http headers via env_ref (leak fix)', () => {
    const transport = resolveServer(
      {
        id: 's1',
        name: 's1',
        enabled: true,
        transport: { type: 'http', url: 'u', headers: { Authorization: 'Bearer {{TOK}}' } },
        variableValues: { TOK: { type: 'env_ref', envVariableId: 'e1' } },
      },
      { e1: 'secret' }
    );
    expect(transport).toEqual({ type: 'http', url: 'u', headers: { Authorization: 'Bearer secret' } });
  });

  it('substitutes stdio env via direct value (leak fix)', () => {
    const transport = resolveServer(
      {
        id: 's2',
        name: 's2',
        enabled: true,
        transport: { type: 'stdio', command: 'run', env: { API_KEY: '{{X}}' } },
        variableValues: { X: { type: 'direct', value: 'literal' } },
      },
      {}
    );
    expect(transport).toEqual({
      type: 'stdio',
      command: 'run',
      args: undefined,
      env: { API_KEY: 'literal' },
    });
  });
});

describe('resolveMcpEnvVars (simulate) fallback', () => {
  it('falls back to envById keyed by placeholder name when variableValues is undefined', () => {
    // No variableValues → must fall back to envById keyed by the placeholder name itself.
    const transport = resolveServer(
      {
        id: 's3',
        name: 's3',
        enabled: true,
        transport: { type: 'http', url: 'u', headers: { Authorization: 'Bearer {{TOK}}' } },
      },
      { TOK: 'fromEnvById' }
    );
    expect(transport).toEqual({ type: 'http', url: 'u', headers: { Authorization: 'Bearer fromEnvById' } });
  });
});
