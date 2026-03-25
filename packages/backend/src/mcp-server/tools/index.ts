import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ServiceContext } from '../types.js';
import { registerAgentDomainTools } from './agentDomainTools.js';
import { registerAgentTools } from './agentTools.js';
import { registerApiKeyTools } from './apiKeyTools.js';
import { registerContextPresetTools } from './contextPresetTools.js';
import { registerEnvVariableTools } from './envVariableTools.js';
import { registerExecutionKeyTools } from './executionKeyTools.js';
import { registerGraphReadTools } from './graphReadTools.js';
import { registerGraphWriteTools } from './graphWriteTools.js';
import { registerMcpLibraryTools } from './mcpLibraryTools.js';
import { registerMcpManagementTools } from './mcpManagementTools.js';
import { registerMcpToolOpsTools } from './mcpToolOpsTools.js';
import { registerOutputSchemaTools } from './outputSchemaTools.js';
import { registerPublishTools } from './publishTools.js';
import { registerValidationTools } from './validationTools.js';

export function registerAllTools(server: McpServer, getContext: () => ServiceContext): void {
  registerAgentTools(server, getContext);
  registerAgentDomainTools(server, getContext);
  registerGraphReadTools(server, getContext);
  registerGraphWriteTools(server, getContext);
  registerMcpManagementTools(server, getContext);
  registerMcpLibraryTools(server, getContext);
  registerMcpToolOpsTools(server, getContext);
  registerOutputSchemaTools(server, getContext);
  registerContextPresetTools(server, getContext);
  registerValidationTools(server, getContext);
  registerEnvVariableTools(server, getContext);
  registerApiKeyTools(server, getContext);
  registerExecutionKeyTools(server, getContext);
  registerPublishTools(server, getContext);
}
