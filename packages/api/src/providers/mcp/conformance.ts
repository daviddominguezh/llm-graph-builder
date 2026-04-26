import type { McpServerConfig } from '@daviddh/graph-types';
import { describe, expect, it } from '@jest/globals';

import type { McpConnector } from './types.js';

export interface ConformanceFixtures {
  /** A server config the connector should be able to connect to. May use a mock URL. */
  validServer: McpServerConfig;
  /** A server config the connector should reject. */
  invalidServer: McpServerConfig;
}

/**
 * Run conformance tests against any McpConnector implementation. Backend tests
 * call this with their connector + a stubbed transport; edge function tests do
 * the same with their connector. Both must pass; drift between runtime impls
 * becomes a CI failure.
 *
 * This file is intentionally NOT named `*.test.ts` so jest does not auto-pick
 * it up. Other test files import `testConnectorConformance` directly.
 *
 * USAGE in a test file:
 *   testConnectorConformance(
 *     'backend',
 *     () => createBackendMcpConnector(),
 *     { validServer, invalidServer }
 *   );
 */
export function testConnectorConformance(
  name: string,
  connectorFactory: () => McpConnector,
  fixtures: ConformanceFixtures
): void {
  describe(`${name} conforms to McpConnector`, () => {
    it('connect() resolves to a client with tools() and close()', async () => {
      const connector = connectorFactory();
      const client = await connector.connect(fixtures.validServer);
      expect(typeof client.tools).toBe('function');
      expect(typeof client.close).toBe('function');
      await client.close();
    });

    it('client.tools() returns a Record<string, Tool>', async () => {
      const connector = connectorFactory();
      const client = await connector.connect(fixtures.validServer);
      try {
        const tools = await client.tools();
        expect(typeof tools).toBe('object');
        expect(tools).not.toBeNull();
      } finally {
        await client.close();
      }
    });

    it('client.close() is idempotent', async () => {
      const connector = connectorFactory();
      const client = await connector.connect(fixtures.validServer);
      await client.close();
      await expect(client.close()).resolves.not.toThrow();
    });

    it('connect() rejects on an invalid server config', async () => {
      const connector = connectorFactory();
      await expect(connector.connect(fixtures.invalidServer)).rejects.toBeDefined();
    });
  });
}
