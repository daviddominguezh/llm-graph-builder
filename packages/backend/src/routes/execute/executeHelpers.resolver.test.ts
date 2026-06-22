import type { McpServerConfig } from '@daviddh/graph-types';
import { describe, expect, it } from '@jest/globals';

import { EMPTY_GRAPH } from './agentRuntimeGraph.js';
import { resolveMcpTransportVariables, resolveServerTransport } from './executeHelpers.js';

const ENV_BY_NAME: Record<string, string> = { API_KEY: 'name-key', HOST: 'name-host' };
const ENV_BY_ID: Record<string, string> = { 'env-1': 'id-secret', 'env-2': 'id-token' };

function httpServer(): McpServerConfig {
  return {
    id: 'srv-http',
    name: 'http',
    enabled: true,
    transport: {
      type: 'http',
      url: 'https://{{HOST}}/mcp',
      headers: { Authorization: 'Bearer {{API_KEY}}', 'X-Token': '{{TOKEN}}' },
    },
    variableValues: {
      HOST: { type: 'direct', value: 'example.com' },
      API_KEY: { type: 'env_ref', envVariableId: 'env-1' },
      TOKEN: { type: 'env_ref', envVariableId: 'env-2' },
    },
  };
}

function stdioServer(): McpServerConfig {
  return {
    id: 'srv-stdio',
    name: 'stdio',
    enabled: true,
    transport: {
      type: 'stdio',
      command: 'run-{{HOST}}',
      args: ['--key', '{{API_KEY}}', '--missing', '{{NOPE}}'],
      env: { SECRET: '{{API_KEY}}', PLAIN: 'static' },
    },
    variableValues: {
      HOST: { type: 'direct', value: 'localhost' },
      API_KEY: { type: 'env_ref', envVariableId: 'env-1' },
    },
  };
}

describe('resolveServerTransport parity', () => {
  it('substitutes http url + headers (direct and env_ref)', () => {
    const resolved = resolveServerTransport(httpServer(), ENV_BY_NAME, ENV_BY_ID);
    expect(resolved.transport).toEqual({
      type: 'http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer id-secret', 'X-Token': 'id-token' },
    });
  });

  it('substitutes stdio command + args + env, leaving unknown vars intact', () => {
    const resolved = resolveServerTransport(stdioServer(), ENV_BY_NAME, ENV_BY_ID);
    expect(resolved.transport).toEqual({
      type: 'stdio',
      command: 'run-localhost',
      args: ['--key', 'id-secret', '--missing', '{{NOPE}}'],
      env: { SECRET: 'id-secret', PLAIN: 'static' },
    });
  });

  it('falls back to env.byName when variableValues is undefined', () => {
    const server: McpServerConfig = {
      id: 'srv-novars',
      name: 'novars',
      enabled: true,
      transport: { type: 'http', url: 'https://{{HOST}}/x', headers: { K: '{{API_KEY}}' } },
    };
    const resolved = resolveServerTransport(server, ENV_BY_NAME, ENV_BY_ID);
    expect(resolved.transport).toEqual({
      type: 'http',
      url: 'https://name-host/x',
      headers: { K: 'name-key' },
    });
  });
});

describe('resolveMcpTransportVariables', () => {
  it('resolves every server transport in the graph', () => {
    const graph = { ...EMPTY_GRAPH, mcpServers: [httpServer(), stdioServer()] };
    const resolved = resolveMcpTransportVariables(graph, ENV_BY_NAME, ENV_BY_ID);
    const [http, stdio] = resolved.mcpServers ?? [];
    expect(http?.transport).toMatchObject({ url: 'https://example.com/mcp' });
    expect(stdio?.transport).toMatchObject({ command: 'run-localhost' });
  });

  it('returns graph unchanged when mcpServers is undefined', () => {
    expect(resolveMcpTransportVariables(EMPTY_GRAPH, ENV_BY_NAME, ENV_BY_ID)).toBe(EMPTY_GRAPH);
  });
});
