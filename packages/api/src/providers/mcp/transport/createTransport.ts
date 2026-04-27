import type { McpServerConfig } from '@daviddh/graph-types';

import { createHttpTransport } from './httpTransport.js';
import { createSseTransport } from './sseTransport.js';
import { createStdioTransport } from './stdioTransport.js';
import type { McpTransport, TransportOptions } from './transport.js';

/**
 * Dispatch on the server config's transport variant and return the matching
 * concrete transport. The high-level MCP client only depends on this factory
 * plus the McpTransport interface.
 */
export async function createTransport(
  server: McpServerConfig,
  options: TransportOptions = {}
): Promise<McpTransport> {
  const { transport } = server;
  if (transport.type === 'http') return createHttpTransport(transport, options);
  if (transport.type === 'sse') return createSseTransport(transport, options);
  return await createStdioTransport(transport, options);
}
