import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ServiceContext } from '../types.js';
import { registerAgentDomainTools } from './agentDomainTools.js';
import { registerAgentTools } from './agentTools.js';
import { registerGraphReadTools } from './graphReadTools.js';
import { registerGraphWriteTools } from './graphWriteTools.js';
import { registerMcpManagementTools } from './mcpManagementTools.js';
import { registerValidationTools } from './validationTools.js';

export function registerAllTools(server: McpServer, getContext: () => ServiceContext): void {
  registerAgentTools(server, getContext);
  registerAgentDomainTools(server, getContext);
  registerGraphReadTools(server, getContext);
  registerGraphWriteTools(server, getContext);
  registerMcpManagementTools(server, getContext);
  registerValidationTools(server, getContext);
}
