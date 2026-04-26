import type { Tool } from 'ai';
import { z } from 'zod';

import { createAgentTool, invokeAgentTool, invokeWorkflowTool } from '../../tools/dispatchTools.js';
import { createFinishTool } from '../../tools/finishTool.js';
import type { ProviderCtx } from '../provider.js';
import type { OpenFlowTool } from '../types.js';

const FINISH_TOOL_NAME = 'finish';

const STUB_OPTIONS = { toolCallId: 'composition-adapter', messages: [] };

function adaptTool(name: string, tool: Tool): OpenFlowTool {
  const { description = '', execute: toolExecute } = tool;
  if (toolExecute === undefined) {
    throw new Error(`Tool ${name} has no execute function`);
  }
  return {
    description,
    inputSchema: z.record(z.string(), z.unknown()),
    execute: async (input: z.infer<z.ZodType>): Promise<unknown> => await toolExecute(input, STUB_OPTIONS),
  };
}

function buildSelectableTools(): Record<string, Tool> {
  return {
    create_agent: createAgentTool(),
    invoke_agent: invokeAgentTool(),
    invoke_workflow: invokeWorkflowTool(),
  };
}

function collectRequestedTools(toolNames: string[], all: Record<string, Tool>): Record<string, OpenFlowTool> {
  return toolNames
    .filter((name) => name !== FINISH_TOOL_NAME)
    .reduce<Record<string, OpenFlowTool>>((acc, name) => {
      const { [name]: tool } = all;
      if (tool === undefined) return acc;
      return { ...acc, [name]: adaptTool(name, tool) };
    }, {});
}

function finishEntry(): Record<string, OpenFlowTool> {
  return { [FINISH_TOOL_NAME]: adaptTool(FINISH_TOOL_NAME, createFinishTool()) };
}

export async function buildCompositionTools(args: {
  toolNames: string[];
  ctx: ProviderCtx;
}): Promise<Record<string, OpenFlowTool>> {
  const all = buildSelectableTools();
  const requested = collectRequestedTools(args.toolNames, all);
  const finish = args.ctx.isChildAgent ? finishEntry() : {};
  return await Promise.resolve({ ...requested, ...finish });
}
