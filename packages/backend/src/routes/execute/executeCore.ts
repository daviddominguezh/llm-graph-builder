import type { CallAgentOutput, SelectedTool } from '@daviddh/llm-graph-runner';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import type { NodeProcessedData } from './edgeFunctionClient.js';
import { executeAgent } from './edgeFunctionClient.js';
import { handleChildFinish, persistCoreResult } from './executeCoreChildFinish.js';
import {
  type BuildCoreParamsOptions,
  buildCoreExecuteParams,
  resolveOAuthBundle,
  resolveVfsCorePayload,
} from './executeCoreHelpers.js';
import { handleInlineDispatch } from './executeCoreInlineDispatch.js';
import {
  type SetupResult,
  presetParentExecutionId,
  resolveChildOverride,
  setupExecution,
} from './executeCoreSetup.js';
import type {
  ExecuteCoreCallbacks,
  ExecuteCoreInput,
  ExecuteCoreOutput,
  OverrideAgentConfig,
} from './executeCoreTypes.js';
import type { FetchedData } from './executeFetcher.js';
import { logExec } from './executeHelpers.js';

export type { ExecuteCoreCallbacks, ExecuteCoreInput, ExecuteCoreOutput, OverrideAgentConfig };

function noop(): void {
  // intentionally empty
}

interface PostExecuteContext {
  supabase: SupabaseClient;
  params: ExecuteCoreInput;
  setup: SetupResult;
  fetched: FetchedData;
  output: CallAgentOutput;
  nodeData: NodeProcessedData[];
  durationMs: number;
  startTime: number;
}

async function handlePostOutput(ctx: PostExecuteContext): Promise<ExecuteCoreOutput | undefined> {
  const { supabase, params, setup, fetched, output, nodeData, durationMs, startTime } = ctx;
  if (output.dispatchResult !== undefined) {
    return await handleInlineDispatch({
      supabase,
      params,
      parentExecutionId: setup.executionId,
      fetched,
      output,
      startTime,
      executeAgentCore,
    });
  }

  await persistCoreResult(supabase, {
    executionId: setup.executionId,
    fetched,
    output,
    nodeData,
    durationMs,
    model: setup.model,
    conversationId: setup.conversationId,
    input: params.input,
  });

  if (output.finishResult !== undefined && fetched.stackTop !== null) {
    return await handleChildFinish({
      supabase,
      params,
      fetched,
      output,
      startTime,
      executeAgentCore,
    });
  }

  return undefined;
}

interface RunAgentParams {
  fetched: FetchedData;
  override: OverrideAgentConfig | undefined;
  input: ExecuteCoreInput;
  model: string;
  conversationId: string | null;
  supabase: SupabaseClient;
  callbacks: ExecuteCoreCallbacks | undefined;
}

interface RunAgentResult {
  output: CallAgentOutput | null;
  nodeData: NodeProcessedData[];
  durationMs: number;
}

async function runAgent(params: RunAgentParams): Promise<RunAgentResult> {
  // agentRecord.selected_tools is not yet in FetchedData (lands in Tasks 18-19).
  // selectedTools defaults to [] so resolveOAuthBundle resolves nothing for built-ins until plumbed.
  const selectedTools: SelectedTool[] = [];
  const mcpServers = params.fetched.graph.mcpServers ?? [];
  const [vfsPayload, oauthByProvider] = await Promise.all([
    resolveVfsCorePayload(params.supabase, params.fetched, params.input.agentId, params.input.orgId),
    resolveOAuthBundle({ supabase: params.supabase, orgId: params.input.orgId, selectedTools, mcpServers }),
  ]);
  const buildOptions: BuildCoreParamsOptions = {
    vfsPayload,
    overrideAgentConfig: params.override ?? params.input.overrideAgentConfig,
    conversationId: params.conversationId ?? undefined,
    oauthByProvider,
    selectedTools,
  };
  const edgeParams = buildCoreExecuteParams(params.fetched, params.input.input, params.model, buildOptions);
  const startTime = Date.now();
  const { output, nodeData } = await executeAgent(edgeParams, {
    onNodeVisited: params.callbacks?.onNodeVisited ?? noop,
    onNodeProcessed: params.callbacks?.onNodeProcessed ?? noop,
  });
  return { output, nodeData, durationMs: Date.now() - startTime };
}

export async function executeAgentCore(
  params: ExecuteCoreInput,
  callbacks?: ExecuteCoreCallbacks
): Promise<ExecuteCoreOutput> {
  const { supabase } = params;

  const parentExecutionId = await presetParentExecutionId(supabase, params);
  const setup = await setupExecution(params, parentExecutionId);
  const overrideResult = await resolveChildOverride(setup.fetched, params, setup.parentExecutionId);

  const startTime = Date.now();
  const { output, nodeData, durationMs } = await runAgent({
    fetched: overrideResult.fetched,
    override: overrideResult.override,
    input: params,
    model: setup.model,
    conversationId: setup.conversationId,
    supabase,
    callbacks,
  });

  if (output !== null) {
    const postResult = await handlePostOutput({
      supabase,
      params,
      setup,
      fetched: overrideResult.fetched,
      output,
      nodeData,
      durationMs,
      startTime,
    });
    if (postResult !== undefined) return postResult;
  }

  logExec('core:complete', { executionId: setup.executionId, durationMs, hasOutput: output !== null });
  return {
    executionId: setup.executionId,
    output,
    nodeData,
    durationMs,
    appType: overrideResult.fetched.appType,
  };
}
