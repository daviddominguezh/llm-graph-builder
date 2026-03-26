import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';
import { registerAgentDomainTools } from './agentDomainTools.js';
import { registerAgentIntelligenceTools } from './agentIntelligenceTools.js';
import { registerAgentTools } from './agentTools.js';
import { registerApiKeyTools } from './apiKeyTools.js';
import { registerContextPresetTools } from './contextPresetTools.js';
import { registerEnvVariableTools } from './envVariableTools.js';
import { registerExecutionIntelTools } from './executionIntelTools.js';
import { registerExecutionKeyTools } from './executionKeyTools.js';
import { registerGraphConvenienceTools } from './graphConvenienceTools.js';
import { registerGraphReadTools } from './graphReadTools.js';
import { registerGraphWriteTools } from './graphWriteTools.js';
import { registerMcpLibraryTools } from './mcpLibraryTools.js';
import { registerMcpManagementTools } from './mcpManagementTools.js';
import { registerMcpToolOpsTools } from './mcpToolOpsTools.js';
import { registerModelTools } from './modelTools.js';
import { registerNodeIntelligenceTools } from './nodeIntelligenceTools.js';
import { registerOutputSchemaTools } from './outputSchemaTools.js';
import { registerPromptTools } from './promptTools.js';
import { registerPublishTools } from './publishTools.js';
import { registerSimulateTools } from './simulateTools.js';
import { registerValidationTools } from './validationTools.js';
import { registerVersionIntelTools } from './versionIntelTools.js';

export function registerAllTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerAgentTools(server, getContext, catalog);
  registerAgentDomainTools(server, getContext, catalog);
  registerGraphReadTools(server, getContext, catalog);
  registerGraphWriteTools(server, getContext, catalog);
  registerMcpManagementTools(server, getContext, catalog);
  registerMcpLibraryTools(server, getContext, catalog);
  registerMcpToolOpsTools(server, getContext, catalog);
  registerOutputSchemaTools(server, getContext, catalog);
  registerContextPresetTools(server, getContext, catalog);
  registerValidationTools(server, getContext, catalog);
  registerEnvVariableTools(server, getContext, catalog);
  registerApiKeyTools(server, getContext, catalog);
  registerExecutionKeyTools(server, getContext, catalog);
  registerPublishTools(server, getContext, catalog);
  registerSimulateTools(server, getContext, catalog);
  registerPromptTools(server, getContext, catalog);
  registerModelTools(server, getContext, catalog);
  registerAgentIntelligenceTools(server, getContext, catalog);
  registerNodeIntelligenceTools(server, getContext, catalog);
  registerExecutionIntelTools(server, getContext, catalog);
  registerGraphConvenienceTools(server, getContext, catalog);
  registerVersionIntelTools(server, getContext, catalog);
}
