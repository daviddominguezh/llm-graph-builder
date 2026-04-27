import type { Tool } from 'ai';

import type { CalendarService } from '../services/calendarService.js';
import type { FormsService } from '../services/formsService.js';
import type { FormDefinition } from '../types/forms.js';
import {
  BOOK_APPOINTMENT_TOOL_NAME,
  CANCEL_APPOINTMENT_TOOL_NAME,
  CHECK_AVAILABILITY_TOOL_NAME,
  GET_EVENT_TOOL_NAME,
  LIST_CALENDARS_TOOL_NAME,
  LIST_EVENTS_TOOL_NAME,
  UPDATE_EVENT_TOOL_NAME,
  createCalendarTools,
} from './calendarTools.js';
import {
  CREATE_AGENT_TOOL_NAME,
  INVOKE_AGENT_TOOL_NAME,
  INVOKE_WORKFLOW_TOOL_NAME,
  createAgentTool,
  invokeAgentTool,
  invokeWorkflowTool,
} from './dispatchTools.js';
import { FINISH_TOOL_NAME, createFinishTool } from './finishTool.js';
import { GET_FORM_FIELD_TOOL_NAME, SET_FORM_FIELDS_TOOL_NAME, createFormsTools } from './formsTools.js';
import {
  GET_LEAD_SCORE_TOOL_NAME,
  type LeadScoringServices,
  SET_LEAD_SCORE_TOOL_NAME,
  createLeadScoringTools,
} from './leadScoringTools.js';

const RESERVED_TOOL_NAMES = new Set([
  CREATE_AGENT_TOOL_NAME,
  INVOKE_AGENT_TOOL_NAME,
  INVOKE_WORKFLOW_TOOL_NAME,
  FINISH_TOOL_NAME,
  SET_LEAD_SCORE_TOOL_NAME,
  GET_LEAD_SCORE_TOOL_NAME,
  SET_FORM_FIELDS_TOOL_NAME,
  GET_FORM_FIELD_TOOL_NAME,
  LIST_CALENDARS_TOOL_NAME,
  CHECK_AVAILABILITY_TOOL_NAME,
  LIST_EVENTS_TOOL_NAME,
  GET_EVENT_TOOL_NAME,
  BOOK_APPOINTMENT_TOOL_NAME,
  UPDATE_EVENT_TOOL_NAME,
  CANCEL_APPOINTMENT_TOOL_NAME,
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
  calendarServices?: CalendarService;
  orgId?: string;
  calendarId?: string;
}

function filterReservedTools(existingTools: Record<string, Tool>): Record<string, Tool> {
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
  return filtered;
}

function maybeAddFormsTools(target: Record<string, Tool>, params: InjectSystemToolsParams): void {
  if (
    params.formsServices === undefined ||
    params.forms === undefined ||
    params.conversationId === undefined
  ) {
    return;
  }
  Object.assign(
    target,
    createFormsTools({
      forms: params.forms,
      services: params.formsServices,
      conversationId: params.conversationId,
    })
  );
}

function maybeAddCalendarTools(target: Record<string, Tool>, params: InjectSystemToolsParams): void {
  if (params.calendarServices === undefined || params.orgId === undefined) return;
  Object.assign(
    target,
    createCalendarTools({
      services: params.calendarServices,
      orgId: params.orgId,
      calendarId: params.calendarId,
    })
  );
}

/**
 * Injects system tools (dispatch + optionally finish) into a tool set.
 * Filters out any MCP tools that conflict with system tool names.
 */
export function injectSystemTools(params: InjectSystemToolsParams): Record<string, Tool> {
  const systemTools: Record<string, Tool> = {
    ...filterReservedTools(params.existingTools),
    [CREATE_AGENT_TOOL_NAME]: createAgentTool(),
    [INVOKE_AGENT_TOOL_NAME]: invokeAgentTool(),
    [INVOKE_WORKFLOW_TOOL_NAME]: invokeWorkflowTool(),
  };
  if (params.isChildAgent) {
    systemTools[FINISH_TOOL_NAME] = createFinishTool();
  }
  Object.assign(
    systemTools,
    createLeadScoringTools({
      services: params.leadScoringServices,
      contextData: params.contextData,
    })
  );
  maybeAddFormsTools(systemTools, params);
  maybeAddCalendarTools(systemTools, params);
  return systemTools;
}
