import { tool } from 'ai';
import { z } from 'zod';

import type { DispatchSentinel } from '@src/types/sentinels.js';

const CREATE_AGENT_TOOL_NAME = '__system_create_agent';
const INVOKE_AGENT_TOOL_NAME = '__system_invoke_agent';
const INVOKE_WORKFLOW_TOOL_NAME = '__system_invoke_workflow';

function createAgentTool() {
  return tool({
    description:
      'Create a new agent dynamically and dispatch it to handle a task. ' +
      'You must provide a system prompt and task. The agent will execute independently.',
    parameters: z.object({
      systemPrompt: z.string().describe('The system prompt for the new agent'),
      task: z.string().describe('The task for the agent to complete'),
      model: z.string().optional().describe('The LLM model to use (defaults to your own model)'),
      tools: z.union([z.literal('all'), z.array(z.string())]).optional()
        .describe('Tools to give the agent: "all" for all your tools, or a list of tool names'),
      contextItems: z.array(z.string()).optional().describe('Context items to inject'),
      maxSteps: z.number().optional().describe('Maximum number of steps'),
      outputSchema: z.record(z.unknown()).optional().describe('JSON Schema to validate the agent output'),
    }),
    execute: async (params): Promise<DispatchSentinel> => {
      return { __sentinel: 'dispatch', type: 'create_agent', params };
    },
  });
}

function invokeAgentTool() {
  return tool({
    description:
      'Invoke an existing agent by its slug to handle a task. ' +
      'The agent will execute independently and return its result.',
    parameters: z.object({
      agentSlug: z.string().describe('The slug of the agent to invoke'),
      version: z.union([z.number(), z.literal('latest')]).describe('Which published version to execute'),
      task: z.string().describe('The task for the agent to complete'),
      contextItems: z.array(z.string()).optional().describe('Additional context items'),
      model: z.string().optional().describe('Override the agent model'),
      outputSchema: z.record(z.unknown()).optional().describe('JSON Schema to validate the agent output'),
    }),
    execute: async (params): Promise<DispatchSentinel> => {
      return { __sentinel: 'dispatch', type: 'invoke_agent', params };
    },
  });
}

function invokeWorkflowTool() {
  return tool({
    description:
      'Invoke an existing workflow by its slug. ' +
      'Provide a user message that matches the workflow routing.',
    parameters: z.object({
      workflowSlug: z.string().describe('The slug of the workflow to invoke'),
      version: z.union([z.number(), z.literal('latest')]).describe('Which published version to execute'),
      user_said: z.string().describe('The user message for workflow routing'),
      contextItems: z.array(z.string()).optional().describe('Additional context items'),
      model: z.string().optional().describe('Override the workflow model'),
    }),
    execute: async (params): Promise<DispatchSentinel> => {
      return { __sentinel: 'dispatch', type: 'invoke_workflow', params };
    },
  });
}

export {
  CREATE_AGENT_TOOL_NAME,
  INVOKE_AGENT_TOOL_NAME,
  INVOKE_WORKFLOW_TOOL_NAME,
  createAgentTool,
  invokeAgentTool,
  invokeWorkflowTool,
};
