import type { McpServerConfig } from '@daviddh/graph-types';

import { createHttpTransport } from './httpTransport.js';
import { createSseTransport } from './sseTransport.js';
import type { McpTransport, TransportOptions } from './transport.js';

/**
 * Dispatch on the server config's transport variant and return the matching
 * concrete transport. The high-level MCP client only depends on this factory
 * plus the McpTransport interface.
 *
 * stdio is intentionally NOT handled here: it's a Node-only transport and
 * including it pulls `node:child_process` into the api package's import graph,
 * which webpack then tries to bundle into the web build. Stdio support lives
 * in `./stdioTransport.js` (only imported by Node-only code paths like the
 * backend's mcp-server services).
 *
 * For production agents, all MCPs are HTTP/SSE — stdio MCPs are local-dev only
 * and would not be used through the Provider abstraction in the first place.
 */
export function createTransport(server: McpServerConfig, options: TransportOptions = {}): McpTransport {
  const { transport } = server;
  if (transport.type === 'http') return createHttpTransport(transport, options);
  if (transport.type === 'sse') return createSseTransport(transport, options);
  throw new Error(
    `Unsupported transport type for Provider abstraction: ${transport.type}. ` +
      'stdio MCP transports are not supported via the Provider abstraction; use ' +
      "createStdioTransport from './stdioTransport.js' directly if needed in a Node-only path."
  );
}
