import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ServiceContext } from '../types.js';
import { registerAgentTools } from './agentTools.js';
import { registerGraphReadTools } from './graphReadTools.js';

export function registerAllTools(server: McpServer, getContext: () => ServiceContext): void {
  registerAgentTools(server, getContext);
  registerGraphReadTools(server, getContext);
}
