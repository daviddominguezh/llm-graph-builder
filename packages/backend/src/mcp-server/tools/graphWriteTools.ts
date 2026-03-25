import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ServiceContext } from '../types.js';
import { registerGraphWriteBatchTools } from './graphWriteToolsBatch.js';
import { registerGraphWriteEdgeTools } from './graphWriteToolsEdges.js';
import { registerGraphWriteNodeTools } from './graphWriteToolsNodes.js';

export function registerGraphWriteTools(server: McpServer, getContext: () => ServiceContext): void {
  registerGraphWriteNodeTools(server, getContext);
  registerGraphWriteEdgeTools(server, getContext);
  registerGraphWriteBatchTools(server, getContext);
}
