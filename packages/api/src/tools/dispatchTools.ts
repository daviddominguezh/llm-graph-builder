import type { Tool } from 'ai';
import { zodSchema } from 'ai';
import { z } from 'zod';

import type { DispatchSentinel } from '@src/types/sentinels.js';

const CREATE_AGENT_TOOL_NAME = 'create_agent';
const INVOKE_AGENT_TOOL_NAME = 'invoke_agent';
const INVOKE_WORKFLOW_TOOL_NAME = 'invoke_workflow';

const createAgentSchema = z.object({
  systemPrompt: z.string().describe('The system prompt for the new agent'),
  task: z.string().describe('The task for the agent to complete'),
  model: z.string().optional().describe('The LLM model to use (defaults to your own model)'),
  tools: z
    .union([z.literal('all'), z.array(z.string())])
    .optional()
    .describe('Tools to give the agent: "all" for all your tools, or a list of tool names'),
  contextItems: z.array(z.string()).optional().describe('Context items to inject'),
  maxSteps: z.number().optional().describe('Maximum number of steps'),
  outputSchema: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('JSON Schema to validate the agent output'),
});

const invokeAgentSchema = z.object({
  agentSlug: z.string().describe('The slug of the agent to invoke'),
  version: z.union([z.number(), z.string()]).describe('Which published version to execute (number or "latest")'),
  task: z.string().describe('The task for the agent to complete'),
  contextItems: z.array(z.string()).optional().describe('Additional context items'),
  model: z.string().optional().describe('Override the agent model'),
  outputSchema: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('JSON Schema to validate the agent output'),
});

const invokeWorkflowSchema = z.object({
  workflowSlug: z.string().describe('The slug of the workflow to invoke'),
  version: z.union([z.number(), z.string()]).describe('Which published version to execute (number or "latest")'),
  user_said: z.string().describe('The user message for workflow routing'),
  contextItems: z.array(z.string()).optional().describe('Additional context items'),
  model: z.string().optional().describe('Override the workflow model'),
});

function buildSentinel(type: DispatchSentinel['type'], params: Record<string, unknown>): DispatchSentinel {
  return { __sentinel: 'dispatch', type, params };
}

function createAgentTool(): Tool {
  return {
    description:
      'Create a new agent dynamically and dispatch it to handle a task. ' +
      'You must provide a system prompt and task. The agent will execute independently.',
    inputSchema: zodSchema(createAgentSchema),
    execute: (args: z.infer<typeof createAgentSchema>): DispatchSentinel =>
      buildSentinel('create_agent', args),
  };
}

function invokeAgentTool(): Tool {
  return {
    description:
      'Invoke an existing agent by its slug to handle a task. ' +
      'The agent will execute independently and return its result.',
    inputSchema: zodSchema(invokeAgentSchema),
    execute: (args: z.infer<typeof invokeAgentSchema>): DispatchSentinel =>
      buildSentinel('invoke_agent', args),
  };
}

function invokeWorkflowTool(): Tool {
  return {
    description:
      'Invoke an existing workflow by its slug. ' +
      'Provide a user message that matches the workflow routing.',
    inputSchema: zodSchema(invokeWorkflowSchema),
    execute: (args: z.infer<typeof invokeWorkflowSchema>): DispatchSentinel =>
      buildSentinel('invoke_workflow', args),
  };
}

export {
  CREATE_AGENT_TOOL_NAME,
  INVOKE_AGENT_TOOL_NAME,
  INVOKE_WORKFLOW_TOOL_NAME,
  createAgentTool,
  invokeAgentTool,
  invokeWorkflowTool,
};
