import type { DiscoveredTool } from './api';
import type { McpServerConfig } from '../schemas/graph.schema';

export interface RegistryTool {
  name: string;
  description: string | undefined;
  inputSchema: Record<string, unknown> | undefined;
  group: string;
  sourceId: string;
}

export interface ToolGroup {
  groupName: string;
  tools: RegistryTool[];
}

const SYSTEM_SERVER_ID = '__system__';
const SYSTEM_SERVER_NAME = 'OpenFlow/Composition';

const SYSTEM_TOOLS: RegistryTool[] = [
  {
    sourceId: SYSTEM_SERVER_ID,
    group: SYSTEM_SERVER_NAME,
    name: 'create_agent',
    description: 'Create a dynamic sub-agent with a custom system prompt and dispatch it to handle a task.',
    inputSchema: {
      type: 'object',
      properties: {
        systemPrompt: { type: 'string', description: 'The system prompt for the new agent' },
        task: { type: 'string', description: 'The task for the agent to complete' },
        model: { type: 'string', description: 'The LLM model to use (defaults to your own model)' },
        tools: { description: 'Tools to give the agent: "all" for all your tools, or a list of tool names' },
        contextItems: { type: 'array', items: { type: 'string' }, description: 'Context items to inject' },
        maxSteps: { type: 'number', description: 'Maximum number of steps' },
        outputSchema: { type: 'object', description: 'JSON Schema to validate the agent output' },
      },
      required: ['systemPrompt', 'task'],
    },
  },
  {
    sourceId: SYSTEM_SERVER_ID,
    group: SYSTEM_SERVER_NAME,
    name: 'invoke_agent',
    description: 'Invoke an existing agent by slug to handle a task independently.',
    inputSchema: {
      type: 'object',
      properties: {
        agentSlug: { type: 'string', description: 'The slug of the agent to invoke' },
        version: { description: 'Which published version to execute (number or "latest")' },
        task: { type: 'string', description: 'The task for the agent to complete' },
        contextItems: { type: 'array', items: { type: 'string' }, description: 'Additional context items' },
        model: { type: 'string', description: 'Override the agent model' },
        outputSchema: { type: 'object', description: 'JSON Schema to validate the agent output' },
      },
      required: ['agentSlug', 'version', 'task'],
    },
  },
  {
    sourceId: SYSTEM_SERVER_ID,
    group: SYSTEM_SERVER_NAME,
    name: 'invoke_workflow',
    description: 'Invoke an existing workflow by slug with a routing message.',
    inputSchema: {
      type: 'object',
      properties: {
        workflowSlug: { type: 'string', description: 'The slug of the workflow to invoke' },
        version: { description: 'Which published version to execute (number or "latest")' },
        user_said: { type: 'string', description: 'The user message for workflow routing' },
        contextItems: { type: 'array', items: { type: 'string' }, description: 'Additional context items' },
        model: { type: 'string', description: 'Override the workflow model' },
      },
      required: ['workflowSlug', 'version', 'user_said'],
    },
  },
];

function buildMcpTools(servers: McpServerConfig[], discovered: Record<string, DiscoveredTool[]>): RegistryTool[] {
  const tools: RegistryTool[] = [];
  for (const server of servers) {
    for (const tool of discovered[server.id] ?? []) {
      tools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        group: server.name,
        sourceId: server.id,
      });
    }
  }
  return tools;
}

function buildGroups(tools: RegistryTool[]): ToolGroup[] {
  const map = new Map<string, RegistryTool[]>();
  for (const tool of tools) {
    const list = map.get(tool.group) ?? [];
    list.push(tool);
    map.set(tool.group, list);
  }
  const groups: ToolGroup[] = [];
  for (const [groupName, groupTools] of map) {
    groupTools.sort((a, b) => a.name.localeCompare(b.name));
    groups.push({ groupName, tools: groupTools });
  }
  const system = groups.filter((g) => g.groupName === SYSTEM_SERVER_NAME);
  const rest = groups.filter((g) => g.groupName !== SYSTEM_SERVER_NAME);
  rest.sort((a, b) => a.groupName.localeCompare(b.groupName));
  return [...rest, ...system];
}

export function buildToolRegistry(
  servers: McpServerConfig[],
  discovered: Record<string, DiscoveredTool[]>
): { tools: RegistryTool[]; groups: ToolGroup[] } {
  const mcpTools = buildMcpTools(servers, discovered);
  const allTools = [...mcpTools, ...SYSTEM_TOOLS];
  return { tools: allTools, groups: buildGroups(allTools) };
}
