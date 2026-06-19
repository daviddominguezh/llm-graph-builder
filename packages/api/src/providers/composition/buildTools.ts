import type { Tool } from 'ai';
import { z } from 'zod';

import { createAgentTool, invokeAgentTool, invokeWorkflowTool } from '../../tools/dispatchTools.js';
import { createFinishTool } from '../../tools/finishTool.js';
import type { ProviderCtx } from '../provider.js';
import type { OpenFlowTool } from '../types.js';

const FINISH_TOOL_NAME = 'finish';

type CompositionToolName = 'create_agent' | 'invoke_agent' | 'invoke_workflow' | typeof FINISH_TOOL_NAME;
type SelectableToolName = Exclude<CompositionToolName, typeof FINISH_TOOL_NAME>;

const STUB_OPTIONS = { toolCallId: 'composition-adapter', messages: [] };

function adaptTool(name: string, tool: Tool): OpenFlowTool {
  const { description = '', execute: toolExecute } = tool;
  if (toolExecute === undefined) {
    throw new Error(`Tool ${name} has no execute function`);
  }
  return {
    description,
    inputSchema: z.record(z.string(), z.unknown()),
    execute: async (input: unknown): Promise<unknown> => await toolExecute(input, STUB_OPTIONS),
  };
}

function buildSelectableTools(): Record<SelectableToolName, Tool> {
  return {
    create_agent: createAgentTool(),
    invoke_agent: invokeAgentTool(),
    invoke_workflow: invokeWorkflowTool(),
  };
}

const SELECTABLE_TOOL_NAMES: readonly string[] = ['create_agent', 'invoke_agent', 'invoke_workflow'];

function isSelectableToolName(s: string): s is SelectableToolName {
  return SELECTABLE_TOOL_NAMES.includes(s);
}

function collectRequestedTools(
  toolNames: string[],
  all: Record<SelectableToolName, Tool>
): Partial<Record<CompositionToolName, OpenFlowTool>> {
  const out: Partial<Record<CompositionToolName, OpenFlowTool>> = {};
  for (const name of toolNames) {
    if (!isSelectableToolName(name)) continue;
    const { [name]: tool } = all;
    out[name] = adaptTool(name, tool);
  }
  return out;
}

function finishEntry(): Partial<Record<CompositionToolName, OpenFlowTool>> {
  return { [FINISH_TOOL_NAME]: adaptTool(FINISH_TOOL_NAME, createFinishTool()) };
}

export async function buildCompositionTools(args: {
  toolNames: string[];
  ctx: ProviderCtx;
}): Promise<Partial<Record<CompositionToolName, OpenFlowTool>>> {
  const all = buildSelectableTools();
  const requested = collectRequestedTools(args.toolNames, all);
  const finish = args.ctx.isChildAgent ? finishEntry() : {};
  return await Promise.resolve({ ...requested, ...finish });
}
