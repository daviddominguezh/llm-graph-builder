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
import {
  GET_LEAD_SCORE_TOOL_NAME,
  type LeadScoringServices,
  SET_LEAD_SCORE_TOOL_NAME,
  createLeadScoringTools,
} from './leadScoringTools.js';
import {
  GET_FORM_FIELD_TOOL_NAME,
  SET_FORM_FIELDS_TOOL_NAME,
  createFormsTools,
} from './formsTools.js';
import type { FormsService } from '../services/formsService.js';
import type { FormDefinition } from '../types/forms.js';

const RESERVED_TOOL_NAMES = new Set([
  CREATE_AGENT_TOOL_NAME,
  INVOKE_AGENT_TOOL_NAME,
  INVOKE_WORKFLOW_TOOL_NAME,
  FINISH_TOOL_NAME,
  SET_LEAD_SCORE_TOOL_NAME,
  GET_LEAD_SCORE_TOOL_NAME,
  SET_FORM_FIELDS_TOOL_NAME,
  GET_FORM_FIELD_TOOL_NAME,
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
  leadScoringServices?: LeadScoringServices;
  formsServices?: FormsService;
  forms?: FormDefinition[];
  conversationId?: string;
  contextData?: Record<string, unknown>;
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

  // Add lead scoring tools (always available)
  const leadScoringTools = createLeadScoringTools({
    services: params.leadScoringServices,
    contextData: params.contextData,
  });
  Object.assign(systemTools, leadScoringTools);

  // Add forms tools (when services + forms + conversationId all provided)
  if (
    params.formsServices !== undefined &&
    params.forms !== undefined &&
    params.conversationId !== undefined
  ) {
    const formsTools = createFormsTools({
      forms: params.forms,
      services: params.formsServices,
      conversationId: params.conversationId,
    });
    Object.assign(systemTools, formsTools);
  }

  return systemTools;
}
