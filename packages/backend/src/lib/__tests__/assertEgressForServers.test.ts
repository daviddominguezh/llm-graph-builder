import type { McpServerConfig } from '@daviddh/graph-types';
import { describe, expect, it, jest } from '@jest/globals';

import { assertEgressForServers } from '../assertEgressForServers.js';
import { EgressBlockedError, type EgressDeps } from '../egressGuard.js';

const IPV4_FAMILY = 4;

/** DNS seam that returns one public address for any host (no real network). */
const publicDeps: EgressDeps = {
  lookup: async () => await Promise.resolve([{ address: '1.1.1.1', family: IPV4_FAMILY }]),
};

function httpServer(id: string, url: string): McpServerConfig {
  return { id, name: id, transport: { type: 'http', url }, enabled: true };
}

const stdioServer: McpServerConfig = {
  id: 'stdio',
  name: 'stdio',
  transport: { type: 'stdio', command: 'npx', args: ['-y', 'x'] },
  enabled: true,
};

describe('assertEgressForServers', () => {
  it('rejects when a server resolves to a private URL', async () => {
    const servers = [httpServer('a', 'http://example.com/mcp'), httpServer('b', 'http://127.0.0.1/mcp')];
    await expect(assertEgressForServers(servers, [], publicDeps)).rejects.toBeInstanceOf(EgressBlockedError);
  });

  it('resolves when all servers are public', async () => {
    const servers = [httpServer('a', 'http://example.com/mcp'), httpServer('b', 'https://other.test/sse')];
    await expect(assertEgressForServers(servers, [], publicDeps)).resolves.toBeUndefined();
  });

  it('skips stdio and empty-url servers (no lookup invoked)', async () => {
    const lookup = jest.fn<EgressDeps['lookup']>(
      async () => await Promise.resolve([{ address: '1.1.1.1', family: IPV4_FAMILY }])
    );
    await expect(assertEgressForServers([stdioServer], [], { lookup })).resolves.toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });
});
