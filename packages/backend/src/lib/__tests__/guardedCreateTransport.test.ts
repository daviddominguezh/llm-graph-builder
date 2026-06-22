import type { McpServerConfig } from '@daviddh/graph-types';
import type { CreateTransportFn, McpTransport } from '@daviddh/llm-graph-runner';
import { describe, expect, it, jest } from '@jest/globals';

import { EgressBlockedError } from '../egressGuard.js';
import { makeGuardedCreateTransport } from '../guardedCreateTransport.js';

/**
 * A sentinel transport — the guard must return whatever `real` returns
 * unchanged. We only assert identity, never exercise the wire surface.
 */
const SENTINEL_TRANSPORT: McpTransport = {
  request: async () => await Promise.resolve(null),
  notify: async () => {
    await Promise.resolve();
  },
  sessionId: null,
  setSessionId: () => undefined,
  close: async () => {
    await Promise.resolve();
  },
};

function makeRealSpy(): jest.MockedFunction<CreateTransportFn> {
  return jest.fn((_server: McpServerConfig): McpTransport => SENTINEL_TRANSPORT);
}

function httpServer(url: string): McpServerConfig {
  return { id: 'mcp-1', name: 'mcp-1', transport: { type: 'http', url }, enabled: true };
}

function stdioServer(): McpServerConfig {
  return {
    id: 'mcp-stdio',
    name: 'mcp-stdio',
    transport: { type: 'stdio', command: 'node', args: ['server.js'] },
    enabled: true,
  };
}

describe('makeGuardedCreateTransport', () => {
  it('rejects a private-resolving URL BEFORE calling real', async () => {
    const real = makeRealSpy();
    const guarded = makeGuardedCreateTransport(real);
    await expect(guarded(httpServer('http://10.0.0.1/mcp'))).rejects.toBeInstanceOf(EgressBlockedError);
    expect(real).not.toHaveBeenCalled();
  });

  it('delegates to real and returns its transport for a public URL', async () => {
    const real = makeRealSpy();
    const guarded = makeGuardedCreateTransport(real);
    const server = httpServer('http://1.1.1.1/mcp');
    const transport = await guarded(server);
    expect(real).toHaveBeenCalledWith(server);
    expect(transport).toBe(SENTINEL_TRANSPORT);
  });

  it('skips the guard and delegates for an stdio (empty-URL) server', async () => {
    const real = makeRealSpy();
    const guarded = makeGuardedCreateTransport(real);
    const server = stdioServer();
    const transport = await guarded(server);
    expect(real).toHaveBeenCalledWith(server);
    expect(transport).toBe(SENTINEL_TRANSPORT);
  });
});
