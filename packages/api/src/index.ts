import type { Tool } from 'ai';

import { INITIAL_STEP_NODE } from './constants/index.js';
import { type CallAgentOutput, callAgentStep } from './core/index.js';
import type { Message } from './types/ai/messages.js';
import type { Context, NodeProcessedEvent } from './types/tools.js';
import type { Logger } from './utils/logger.js';
import { setLogger } from './utils/logger.js';
import { Pipeline } from './utils/pipeline.js';

export { buildNextAgentConfig } from './stateMachine/index.js';
export { buildAgentToolsAtStart } from './core/buildAgentToolsAtStart.js';
export { resolveToolsForCurrentNode } from './core/resolveToolsForCurrentNode.js';
export type { ResolveToolsArgs, ResolveToolsResult } from './core/resolveToolsForCurrentNode.js';
export { createDummyToolsForGraph } from './tools/dummyTools.js';
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

export {
  DEFAULT_CALENDAR_ID,
  LIST_CALENDARS_TOOL_NAME,
  CHECK_AVAILABILITY_TOOL_NAME,
  LIST_EVENTS_TOOL_NAME,
  GET_EVENT_TOOL_NAME,
  BOOK_APPOINTMENT_TOOL_NAME,
  UPDATE_EVENT_TOOL_NAME,
  CANCEL_APPOINTMENT_TOOL_NAME,
} from './tools/calendarToolSchemas.js';

export { hashServerUrl, serverUrlSideTableKey } from './cache/serverHash.js';
export type { ServerUrlSideTableEntry } from './cache/serverHash.js';

export {
  MAX_CACHE_VALUE_BYTES,
  isCacheableSize,
  mcpCurrentVersionKey,
  mcpToolsListKey,
} from './cache/mcpToolsListCache.js';

export { mcpSessionKey } from './providers/mcp/sessionCache.js';

export type { SelectedTool, ProviderType, BuiltinProviderId } from './types/selectedTool.js';
export { BUILTIN_PROVIDER_IDS, equalsSelectedTool } from './types/selectedTool.js';

export {
  MAX_SELECTED_TOOLS,
  PatchSelectedToolsBodySchema,
  SelectedToolSchema,
} from './types/selectedToolSchema.js';
export type { PatchSelectedToolsBody } from './types/selectedToolSchema.js';

export {
  builtInProviders,
  composeRegistry,
  namespaceToolName,
  parseNamespacedToolName,
  toAiSdkTool,
  toAiSdkToolDict,
  TOOL_NAMESPACE_SEPARATOR,
} from './providers/index.js';
export {
  connectMcp,
  createTransport,
  type McpClientHandle,
  type McpTransport,
  type RawMcpTool,
} from './providers/mcp/index.js';
export { extractServerUrl, type CreateTransportFn } from './providers/mcp/ensureSession.js';
export { McpError, SessionExpiredError, TransportError, isSessionExpired } from './providers/mcp/index.js';
export { withAbortTimeout, AbortTimeoutError } from './providers/mcp/transport/withAbortTimeout.js';
export type {
  Provider,
  ProviderCtx,
  ToolDescriptor,
  Registry,
  RegistryBuildResult,
  ComposeRegistryArgs,
  ProviderFailure,
  FailureReason,
  DescribeAllItem,
  OpenFlowTool,
  OAuthTokenBundle,
  ToolErrorCode,
  KvStoreServices,
  RagStoreServices,
  KvSearchArgs,
  KvRegexArgs,
  KvSearchTarget,
  RagSearchArgs,
  RagRegexArgs,
  SearchPage,
  BuiltinBundles,
  FormsServices,
  LeadScoringProviderServices,
  WebSearchService,
  WebProviderServices,
  TavilyConfig,
} from './providers/index.js';
export { ToolError, isKvStoreServices, isRagStoreServices } from './providers/index.js';
export { makeTavilyWebService } from './providers/index.js';

// RU3 runtime unification: public barrel surface (consumed by RU4/RU5 + the backend).
export type { ExecutionEvent, Tokens } from './events/types.js';
export { createEventEmitter } from './events/emitter.js';
export type { ChildResult, ChildErrorCode, TerminationInput } from './runtime/childResult.js';
export { mapTerminationToChildResult } from './runtime/childResult.js';
export type {
  RuntimeCapabilities,
  RuntimeServices,
  ResolveChildInput,
  ResolvedChildConfig,
  McpInvoker,
  SupabaseLike,
  DispatchStrategy,
  DispatchOutcome,
  DispatchArgs,
  DispatchPersistence,
  DispatchHandle,
  Observability,
  RateLimiter,
  RunnerLogger,
} from './capabilities/index.js';
export { executeTurn } from './runtime/executeTurn.js';
export { childDispatch } from './runtime/childDispatch.js';
export { selectStepMachine } from './runtime/selectStepMachine.js';
export type { StepMachine, StepReport } from './runtime/stepMachine.js';
export { createSimStateStore, deepFreeze } from './runtime/simStateStore.js';
export type { SimStateStore, SimStatePatch } from './runtime/simStateStore.js';
export { setByJsonPointer } from './runtime/jsonPointer.js';
export { simulatedNoop } from './runtime/simulatedNoop.js';
export { syncRecurseStrategy } from './simulation/syncRecurseStrategy.js';
export { noopPersistence } from './simulation/noopPersistence.js';
export { consoleObservability, consoleLogger, noopRateLimit } from './simulation/consoleCapabilities.js';
export { makeResolveChildConfig } from './runtime/resolveChildConfig.js';
export { MAX_DISPATCH_DEPTH, MAX_CHILD_RUNTIME_MS } from './runtime/types.js';
export type { RuntimeInput, RuntimeOutput, DeepReadonly, ExecutionType, ToolRef } from './runtime/types.js';

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
