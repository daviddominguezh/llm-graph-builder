import type { ToolDescriptor } from '../provider.js';

const createAgentInputSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    systemPrompt: {
      type: 'string',
      description: 'The system prompt for the new agent',
    },
    task: {
      type: 'string',
      description: 'The task for the agent to complete',
    },
    model: {
      type: 'string',
      description: 'The LLM model to use (defaults to your own model)',
    },
    tools: {
      oneOf: [
        { type: 'string', enum: ['all'] },
        { type: 'array', items: { type: 'string' } },
      ],
      description: 'Tools to give the agent: "all" for all your tools, or a list of tool names',
    },
    contextItems: {
      type: 'array',
      items: { type: 'string' },
      description: 'Context items to inject',
    },
    maxSteps: {
      type: 'number',
      description: 'Maximum number of steps',
    },
    outputSchema: {
      type: 'object',
      additionalProperties: true,
      description: 'JSON Schema to validate the agent output',
    },
  },
  required: ['systemPrompt', 'task'],
};

const invokeAgentInputSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    agentSlug: {
      type: 'string',
      description: 'The slug of the agent to invoke',
    },
    version: {
      oneOf: [{ type: 'number' }, { type: 'string' }],
      description: 'Which published version to execute (number or "latest")',
    },
    task: {
      type: 'string',
      description: 'The task for the agent to complete',
    },
    contextItems: {
      type: 'array',
      items: { type: 'string' },
      description: 'Additional context items',
    },
    model: {
      type: 'string',
      description: 'Override the agent model',
    },
    outputSchema: {
      type: 'object',
      additionalProperties: true,
      description: 'JSON Schema to validate the agent output',
    },
  },
  required: ['agentSlug', 'version', 'task'],
};

const invokeWorkflowInputSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    workflowSlug: {
      type: 'string',
      description: 'The slug of the workflow to invoke',
    },
    version: {
      oneOf: [{ type: 'number' }, { type: 'string' }],
      description: 'Which published version to execute (number or "latest")',
    },
    user_said: {
      type: 'string',
      description: 'The user message for workflow routing',
    },
    contextItems: {
      type: 'array',
      items: { type: 'string' },
      description: 'Additional context items',
    },
    model: {
      type: 'string',
      description: 'Override the workflow model',
    },
  },
  required: ['workflowSlug', 'version', 'user_said'],
};

export const COMPOSITION_DESCRIPTORS: ToolDescriptor[] = [
  {
    toolName: 'create_agent',
    description:
      'Create a new agent dynamically and dispatch it to handle a task. ' +
      'You must provide a system prompt and task. The agent will execute independently.',
    inputSchema: createAgentInputSchema,
  },
  {
    toolName: 'invoke_agent',
    description:
      'Invoke an existing agent by its slug to handle a task. ' +
      'The agent will execute independently and return its result.',
    inputSchema: invokeAgentInputSchema,
  },
  {
    toolName: 'invoke_workflow',
    description:
      'Invoke an existing workflow by its slug. ' +
      'Provide a user message that matches the workflow routing.',
    inputSchema: invokeWorkflowInputSchema,
  },
];
