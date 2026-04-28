import type { McpServerConfig } from '@daviddh/graph-types';

import { createHttpTransport } from './httpTransport.js';
import { createSseTransport } from './sseTransport.js';
import type { McpTransport, TransportOptions } from './transport.js';

/**
 * Dispatch on the server config's transport variant and return the matching
 * concrete transport. The high-level MCP client only depends on this factory
 * plus the McpTransport interface.
 *
 * stdio is lazy-loaded via `webpackIgnore: true` so the Node-only
 * `node:child_process` import doesn't get pulled into web bundles. Web/edge
 * function callers never hit this branch (browsers and Deno can't spawn
 * processes), so the unreachable dynamic import is harmless in those runtimes.
 */
export async function createTransport(
  server: McpServerConfig,
  options: TransportOptions = {}
): Promise<McpTransport> {
  const { transport } = server;
  if (transport.type === 'http') return createHttpTransport(transport, options);
  if (transport.type === 'sse') return createSseTransport(transport, options);
  const mod = await import(/* webpackIgnore: true */ './stdioTransport.js');
  return await mod.createStdioTransport(transport, options);
}
