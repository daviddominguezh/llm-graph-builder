import type { Tool } from 'ai';

import { INITIAL_STEP_NODE } from './constants/index.js';
import { type CallAgentOutput, callAgentStep } from './core/index.js';
import type { Message } from './types/ai/messages.js';
import type { Context, NodeProcessedEvent } from './types/tools.js';
import type { Logger } from './utils/logger.js';
import { setLogger } from './utils/logger.js';
import { Pipeline } from './utils/pipeline.js';

export { buildNextAgentConfig } from './stateMachine/index.js';
export { createDummyToolsForGraph } from './tools/dummyTools.js';
export { injectSystemTools } from './tools/systemToolInjector.js';
export type { LeadScoringServices } from './tools/leadScoringTools.js';
export { SET_LEAD_SCORE_TOOL_NAME, GET_LEAD_SCORE_TOOL_NAME } from './tools/leadScoringTools.js';
export type { DispatchSentinel, FinishSentinel } from './types/sentinels.js';
export { isDispatchSentinel, isFinishSentinel } from './types/sentinels.js';
export { unwrapToolOutput } from './core/sentinelDetector.js';
export type { CallAgentOutput } from './core/index.js';
export type { Message } from './types/ai/messages.js';
export { MESSAGES_PROVIDER } from './types/ai/messages.js';
export type { TokenLog, ActionTokenUsage } from './types/ai/logs.js';
export type { Context, NodeProcessedEvent } from './types/tools.js';
export type { Logger } from './utils/logger.js';

export { executeAgentLoop, executeAgentLoopSimple } from './agentLoop/index.js';
export type {
  AgentLoopCallbacks,
  AgentLoopConfig,
  AgentLoopResult,
  AgentStepEvent,
  AgentToolCallRecord,
  AgentToolEvent,
  SkillDefinition,
} from './agentLoop/index.js';
export { AGENT_LOOP_HARD_LIMIT } from './agentLoop/index.js';

export { VFSContext } from './vfs/index.js';
export { generateVFSTools } from './vfs/index.js';
export type { VFSContextConfig } from './vfs/index.js';
// GitHubSourceProvider is NOT exported here — it uses Node/Deno APIs incompatible with browser bundles.
// The Edge Function imports it via the @daviddh/vfs-providers alias in its deno.json.

export type {
  ValidationKind,
  LengthPayload,
  ValidationRule,
  ValidationsMap,
  FormDefinition,
  FormData,
  PathSegment,
  FieldApplyResult,
  ApplyResult,
  FailedAttempt,
} from './types/forms.js';

export { slugNormalize } from './lib/forms/slugNormalize.js';
export { parsePath } from './lib/forms/parsePath.js';
export { normalizePath } from './lib/forms/normalizePath.js';
export { collectFieldPaths, collectSimpleLeafPaths } from './lib/forms/collectFieldPaths.js';
export type { SimpleLeafType, SimpleLeaf } from './lib/forms/collectFieldPaths.js';
export { zodForFieldPath } from './lib/forms/zodForFieldPath.js';
export { runValidation } from './lib/forms/runValidation.js';
export { readFormField } from './lib/forms/readFormField.js';
export { applyFormFields } from './lib/forms/applyFormFields.js';
export { expandArrayColumns, ARRAY_EXPANSION_CAP } from './lib/forms/expandArrayColumns.js';
export { formatCsvRow } from './lib/forms/formatCsvRow.js';
export { formatRelativeTime } from './lib/forms/relativeTime.js';
export type { RelativeTime } from './lib/forms/relativeTime.js';

export type { FormsService } from './services/formsService.js';
export {
  createFormsTools,
  buildFormsToolDescription,
  SET_FORM_FIELDS_TOOL_NAME,
  GET_FORM_FIELD_TOOL_NAME,
} from './tools/formsTools.js';
export type { CreateFormsToolsParams } from './tools/formsTools.js';

export type {
  CalendarService,
  CheckAvailabilityArgs,
  ListEventsArgs,
  EventRefArgs,
  BookAppointmentArgs,
  UpdateEventArgs,
} from './services/calendarService.js';
export type {
  CalendarSummary,
  CalendarEvent,
  CalendarAttendee,
  AvailableSlot,
  BookAppointmentInput,
  UpdateEventInput,
} from './types/calendar.js';
export {
  createCalendarTools,
  DEFAULT_CALENDAR_ID,
  LIST_CALENDARS_TOOL_NAME,
  CHECK_AVAILABILITY_TOOL_NAME,
  LIST_EVENTS_TOOL_NAME,
  GET_EVENT_TOOL_NAME,
  BOOK_APPOINTMENT_TOOL_NAME,
  UPDATE_EVENT_TOOL_NAME,
  CANCEL_APPOINTMENT_TOOL_NAME,
} from './tools/calendarTools.js';
export type { CreateCalendarToolsParams } from './tools/calendarTools.js';

export const execute = async (
  context: Context,
  messages: Message[],
  currentNode?: string,
  logger?: Logger
): Promise<CallAgentOutput | null> => {
  if (logger !== undefined) setLogger(logger);
  return await Pipeline.executeSingleStep(context, callAgentStep, {
    messages,
    tokensLog: [],
    currentNode: currentNode ?? INITIAL_STEP_NODE,
    structuredOutputs: {},
  });
};

export interface ExecuteWithCallbacksOptions {
  context: Context;
  messages: Message[];
  currentNode?: string;
  logger?: Logger;
  toolsOverride?: Record<string, Tool>;
  onNodeVisited?: (nodeId: string) => void;
  onNodeProcessed?: (event: NodeProcessedEvent) => void;
  structuredOutputs?: Record<string, unknown[]>;
}

export const executeWithCallbacks = async (
  options: ExecuteWithCallbacksOptions
): Promise<CallAgentOutput | null> => {
  if (options.logger !== undefined) setLogger(options.logger);
  const context: Context = {
    ...options.context,
    toolsOverride: options.toolsOverride,
    onNodeVisited: options.onNodeVisited,
    onNodeProcessed: options.onNodeProcessed,
  };
  return await Pipeline.executeSingleStep(context, callAgentStep, {
    messages: options.messages,
    tokensLog: [],
    currentNode: options.currentNode ?? INITIAL_STEP_NODE,
    structuredOutputs: options.structuredOutputs ?? {},
  });
};
