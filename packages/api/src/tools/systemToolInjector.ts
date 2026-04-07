import type { Tool } from 'ai';

import {
  CREATE_AGENT_TOOL_NAME,
  INVOKE_AGENT_TOOL_NAME,
  INVOKE_WORKFLOW_TOOL_NAME,
  createAgentTool,
  invokeAgentTool,
  invokeWorkflowTool,
} from './dispatchTools.js';
import { FINISH_TOOL_NAME, createFinishTool } from './finishTool.js';

const RESERVED_TOOL_NAMES = new Set([
  CREATE_AGENT_TOOL_NAME,
  INVOKE_AGENT_TOOL_NAME,
  INVOKE_WORKFLOW_TOOL_NAME,
  FINISH_TOOL_NAME,
]);

/**
 * Checks if a tool name conflicts with a reserved system tool name.
 * MCP tools with these names should be rejected.
 */
export function isReservedToolName(toolName: string): boolean {
  return RESERVED_TOOL_NAMES.has(toolName);
}

interface InjectSystemToolsParams {
  existingTools: Record<string, Tool>;
  isChildAgent: boolean;
}

/**
 * Injects system tools (dispatch + optionally finish) into a tool set.
 * Filters out any MCP tools that conflict with system tool names.
 */
export function injectSystemTools(params: InjectSystemToolsParams): Record<string, Tool> {
  const { existingTools, isChildAgent } = params;

  // Filter out conflicting MCP tools
  const filtered: Record<string, Tool> = {};
  for (const [name, t] of Object.entries(existingTools)) {
    if (isReservedToolName(name)) {
      process.stderr.write(
        `[systemTools] WARNING: Rejecting MCP tool "${name}" — reserved system tool name\n`
      );
      continue;
    }
    filtered[name] = t;
  }

  // Add dispatch tools (always available)
  const systemTools: Record<string, Tool> = {
    ...filtered,
    [CREATE_AGENT_TOOL_NAME]: createAgentTool(),
    [INVOKE_AGENT_TOOL_NAME]: invokeAgentTool(),
    [INVOKE_WORKFLOW_TOOL_NAME]: invokeWorkflowTool(),
  };

  // Add finish tool (child agents only)
  if (isChildAgent) {
    systemTools[FINISH_TOOL_NAME] = createFinishTool();
  }

  return systemTools;
}
